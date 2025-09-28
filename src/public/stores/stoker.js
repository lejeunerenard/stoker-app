function stokerStore (state, emitter) {
  // Blank state
  state = Object.assign(state, {
    data: [],
    stokerIP: null,
    errors: [],
    sessions: [],
    sessionID: null
  })

  state.events.SESSION_SET = 'session:set'

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

  // Update state w/ new data
  emitter.on('data', (data) => {
    emitter.emit('chart:render', data)
    state.data.push(data)
    emitter.emit(state.events.RENDER)
  })

  emitter.on(state.events.SESSION_SET, (session) => {
    if (!session) throw Error('no session provided to `session:set`')
    const { id } = session
    if (id === undefined) throw Error('no id provided to `session:set`')

    state.sessionID = id
    emitter.emit('chart:clear')

    // axios.get(`http://${window.location.hostname ? window.location.hostname : 'localhost'}:${PORT}/data/${id}`)
    //   .then((response) => {
    //     const session = response.data
    //     const data = session.data
    //     for (let i = 0; i < data.length; i++) {
    //       const datapoint = data[i]
    //       const update = i === data.length - 1
    //       emitter.emit('chart:render', datapoint, update)
    //     }
    //   })
  })

  emitter.once('rpc:ready', async (rpc) => {
    const { sessions } = await rpc.getSessions()
    state.sessions = sessions

    const latest = state.sessions[state.sessions.length - 1]
    emitter.emit(state.events.SESSION_SET, latest)
    emitter.emit(state.events.RENDER)
  })
}

module.exports = stokerStore
