const { toHex } = require('b4a')

export function stokerStore (state, emitter) {
  // Blank state
  state = Object.assign(state, {
    // latest datapoint per field (name → `{ name, tempCurrent, timestamp }`),
    // read by the `latest-stats` view
    latest: {},
    lastUpdate: null,
    stokerIP: null,
    errors: [],
    sessions: [],
    sessionID: null,
    // closer for the live `session-data` stream, null when the chart view is
    // off this route
    chartStream: null,
    // newest timestamp received; a reopened stream's `since` cursor, null =
    // read the whole session
    chartCursor: null,
    // timestamp → field names already delivered at it, kept to the backfill
    // window so the re-requested overlap dedupes in bounded memory
    chartSeen: null,
    // chart route rendering? `chart:enable`/`chart:disable` from the views set
    // it: the stream only stays open while it is true
    chartView: false
  })

  state.events.SESSION_SET = 'session:set'

  // the worker rewinds its cursor by this much on every query once it has
  // delivered a datapoint (see workers/main.mjs)
  const CHART_BACKFILL_MS = 60000

  emitter.once('store:get:stokerIP', (ip) => {
    if (ip) {
      state.stokerIP = ip
      emitter.emit(state.events.RENDER)
    }
  })

  emitter.on('form-submit:stoker-settings', (formData) => {
    state.errors = []

    const initialStokerIP = state.stokerIP
    for (const [key, value] of formData) {
      state[key] = value
    }

    if (initialStokerIP !== state.stokerIP) {
      emitter.emit('store:set', 'stokerIP', state.stokerIP)
      state.errors.push(`Stoker ip changed to ${state.stokerIP}`)
    }
    emitter.emit(state.events.RENDER)
  })

  emitter.on('stoker:not-found', () => {
    state.errors = []
    state.errors.push(`Stoker cannot be found at ${state.stokerIP}`)
    emitter.emit(state.events.RENDER)
  })

  // generic error from stoker
  emitter.on('stoker:error', () => {
    state.errors = []
    state.errors.push(`Stoker at ${state.stokerIP} returned an unexpected response`)
    emitter.emit(state.events.RENDER)
  })

  // One live `session-data` stream per chart
  function startChartData () {
    if (!state.sessionID) return

    if (state.chartStream) {
      state.chartStream()
      state.chartStream = null
    }

    const args = { sessionId: state.sessionID }
    if (state.chartCursor) {
      args.since = new Date(Number(state.chartCursor))
    }

    try {
      state.chartStream = state.rpc.sessionData(
        args,
        (chunk) => {
          collectChunk(chunk)
        },
        (message) => {
          state.errors = []
          state.errors.push(`Session data stream failed: ${message}`)
          emitter.emit(state.events.RENDER)
        }
      )
    } catch (err) {
      state.errors = []
      state.errors.push(`Session data stream failed: ${err.message}`)
      emitter.emit(state.events.RENDER)
    }
  }

  // Fold one chunk into the `latest` map and the chart dataset. Re-delivered
  // points are expected (the worker's cursor rewind), `chartSeen` filters them
  function collectChunk (chunk) {
    if (!state.chartSeen) return

    const dataset = {}
    let newPoints = 0

    for (const point of chunk.sensors) {
      const timestamp = Number(point.timestamp)
      let names = state.chartSeen.get(timestamp)
      if (!names) {
        names = new Set()
        state.chartSeen.set(timestamp, names)
      }
      if (names.has(point.name)) continue
      names.add(point.name)
      newPoints += 1

      state.latest[point.name] = point
      if (!state.lastUpdate || timestamp > Number(state.lastUpdate)) {
        state.lastUpdate = point.timestamp
      }
      if (!state.chartCursor || timestamp > Number(state.chartCursor)) {
        state.chartCursor = point.timestamp
      }

      if (!dataset[point.name]) dataset[point.name] = []
      dataset[point.name].push({ x: point.timestamp, y: point.tempCurrent })
    }

    // nothing new: no redraw, and drop the seen-window below the oldest
    // timestamp a future query can ask for
    if (!newPoints) return

    if (state.chartCursor) {
      const floor = Number(state.chartCursor) - CHART_BACKFILL_MS
      for (const timestamp of state.chartSeen.keys()) {
        if (timestamp < floor) state.chartSeen.delete(timestamp)
      }
    }

    emitter.emit('chart:render', dataset)
    emitter.emit(state.events.RENDER)
  }

  emitter.on(state.events.SESSION_SET, (session) => {
    if (!session) throw Error('no session provided to `session:set`')
    const { id } = session
    if (id === undefined) throw Error('no id provided to `session:set`')

    // the previous session's live stream: closing it tells the worker to stop
    // querying for that session
    if (state.chartStream) {
      state.chartStream()
      state.chartStream = null
    }

    state.sessionID = id
    state.chartCursor = null
    state.chartSeen = new Map()
    state.latest = {}
    state.lastUpdate = null
    emitter.emit('chart:clear')

    // the worker reads `currentSession` when recording datapoints: it tags the
    // series it writes from now on with this session
    try {
      emitter.emit('store:set', 'currentSession', toHex(id.key))
    } catch (err) {
      state.errors = []
      state.errors.push(`Current session could not be tagged: ${err.message}`)
    }

    // reopen only when the chart route is the one rendering: from the
    // session-management tab the stream stays closed until `chart:enable`
    if (state.chartView) startChartData()
    emitter.emit(state.events.RENDER)
  })

  // Chart view rendering: open the live stream (already open: no-op). While it
  // is open the renderer gets a message per chunk the worker reads off the db
  emitter.on('chart:enable', () => {
    state.chartView = true
    if (state.chartStream) return
    if (!state.sessionID) return
    startChartData()
    emitter.emit(state.events.RENDER)
  })

  // Session-management view: close the stream, so the renderer stops receiving
  // from the worker. The cursor and seen-window stay: reopening resumes with
  // `since` at the last timestamp the renderer saw
  emitter.on('chart:disable', () => {
    state.chartView = false
    if (!state.chartStream) return
    state.chartStream()
    state.chartStream = null
  })
}
