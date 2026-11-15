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
    // closer for the in-flight `session-data` fetch, null when idle
    chartStream: null,
    // newest timestamp received; the next request's `since` cursor (less the
    // backfill), null = fetch the whole session
    chartCursor: null,
    // setTimeout handle for the pending poll
    chartTimer: null,
    // ms timestamp of the last fetch
    chartLastPollAt: null,
    // timestamp → field names already delivered at it, kept to the backfill
    // window so the re-requested overlap dedupes in bounded memory
    chartSeen: null,
    // chart view engaged? polls stop when the session-management tab renders
    chartActive: false
  })

  state.events.SESSION_SET = 'session:set'

  // stoker-server polls every 5 s; the chart fetches once per period
  const POLL_PERIOD_MS = 5000

  // how far the cursor is rewound on follow-up fetches. A series row is
  // created by the same flush as a field's first datapoint, so a fetch whose
  // `findSeries` scan ran before that flush cannot see the new field at all;
  // re-requesting a window covers it, `chartSeen` dedupes the overlap
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

  // One finite `session-data` fetch. hrpc v4 never reports a response ending
  // (see preload note), so the poll timer, not a stream event, schedules the
  // next one — including after a throw here
  function requestChartData () {
    if (!state.chartActive || !state.sessionID) return

    if (state.chartStream) {
      state.chartStream()
      state.chartStream = null
    }

    state.chartLastPollAt = Date.now()

    const args = { sessionId: state.sessionID }
    if (state.chartCursor) {
      args.since = new Date(Math.max(0, Number(state.chartCursor) - CHART_BACKFILL_MS))
    }

    try {
      state.chartStream = state.rpc.sessionData(
        args,
        (chunk) => {
          collectChunk(chunk)
        },
        (message) => {
          state.errors = []
          state.errors.push(`Session data fetch failed: ${message}`)
          emitter.emit(state.events.RENDER)
        }
      )
    } catch (err) {
      state.errors = []
      state.errors.push(`Session data fetch failed: ${err.message}`)
      emitter.emit(state.events.RENDER)
    }
  }

  // Fold one fetch chunk into the `latest` map and the chart dataset.
  // Re-delivered points are expected (inclusive cursor + backfill), `chartSeen`
  // filters them
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
    // timestamp a future fetch can ask for
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

  function schedulePoll () {
    if (state.chartTimer) return
    // next fetch at the period deadline after the last one; the 250 ms floor
    // stops a slow fetch from firing a refetch burst
    const elapsed = state.chartLastPollAt ? Date.now() - state.chartLastPollAt : 0
    state.chartTimer = setTimeout(
      () => {
        state.chartTimer = null
        if (!state.chartActive) return
        requestChartData()
        schedulePoll()
      },
      Math.max(250, POLL_PERIOD_MS - elapsed)
    )
  }

  emitter.on(state.events.SESSION_SET, (session) => {
    if (!session) throw Error('no session provided to `session:set`')
    const { id } = session
    if (id === undefined) throw Error('no id provided to `session:set`')

    // drop the previous session's in-flight fetch and pending poll
    if (state.chartStream) {
      state.chartStream()
      state.chartStream = null
    }
    if (state.chartTimer) {
      clearTimeout(state.chartTimer)
      state.chartTimer = null
    }

    state.sessionID = id
    state.chartCursor = null
    state.chartSeen = new Map()
    state.chartLastPollAt = null
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

    state.chartActive = true
    requestChartData()
    schedulePoll()
    emitter.emit(state.events.RENDER)
  })

  // Chart view rendering: start the poll chain (already engaged: no-op)
  emitter.on('chart:enable', () => {
    if (state.chartActive) return
    if (!state.sessionID) return
    state.chartActive = true
    requestChartData()
    schedulePoll()
    emitter.emit(state.events.RENDER)
  })

  // Session-management view: stop polling and cancel the in-flight fetch.
  // The worker keeps recording datapoints into the hyperdb regardless
  emitter.on('chart:disable', () => {
    state.chartActive = false
    if (state.chartTimer) {
      clearTimeout(state.chartTimer)
      state.chartTimer = null
    }
    if (state.chartStream) {
      state.chartStream()
      state.chartStream = null
    }
  })
}
