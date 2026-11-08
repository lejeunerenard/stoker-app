// Session management store: owns `state.sessions` (loaded from the hyperdb
// session collection over the `get-sessions` RPC), creates new sessions when
// the create-session form in the session management tab submits, and deletes
// sessions triggered from that tab.
export function sessionManagementStore (state, emitter) {
  state.events.SESSION_DELETE = 'session:delete'
  state.events.SESSION_EDIT = 'session:edit'

  // The session being edited via the create-session form (set by the per-session
  // edit buttons in the session management tab)
  state.editingSession = null

  emitter.on(state.events.RENDER, () => {
    // The chart.js canvas lives outside the nano-morph root (#app), so it is
    // shown/hidden here per route instead of by a view
    const canvas = document.querySelector('canvas')
    if (canvas) {
      canvas.style.display = state.route === 'session-management' ? 'none' : ''
    }
  })

  // Newest created first so the dropdown & tab lead with the latest session
  function sortSessions (sessions) {
    return sessions.sort((a, b) => b.id.createdOn - a.id.createdOn)
  }

  function setSessions (sessions) {
    state.sessions = sortSessions(sessions)
    emitter.emit(state.events.RENDER)
  }

  emitter.once('rpc:ready', async (rpc) => {
    const { sessions } = await rpc.getSessions()
    setSessions(sessions)

    // Select the latest session to start streaming
    if (state.sessions.length && !state.sessionID) {
      emitter.emit(state.events.SESSION_SET, state.sessions[0])
    }
  })

  // Edit a session: the edit buttons in the tab set `editingSession`, then the
  // create-session form is reused with that session's values populated
  emitter.on(state.events.SESSION_EDIT, (session) => {
    state.editingSession = session
    state.formState.sessionName = session.name
    emitter.emit(state.events.RENDER)
  })

  // The create-session form of the session management tab: form fields cover
  // the editable aspects of a session (`sessionName` maps to the RPC `name`
  // field). `id.createdOn` & `id.key` are not form fields, they are defaulted
  // by the worker on creation. With `editingSession` set the same submit
  // updates the existing session instead of creating a new one
  emitter.on('form-submit:create-session', async (formData) => {
    const fields = {}
    for (const [key, value] of formData) {
      fields[key] = value
    }

    try {
      if (state.editingSession) {
        const editing = state.editingSession
        state.editingSession = null

        await state.rpc.editSession({
          sessionId: editing.id,
          name: fields.sessionName
        })

        // Reflect the saved record on the shared list entry
        editing.name = fields.sessionName
        emitter.emit(state.events.RENDER)
        return
      }

      const session = await state.rpc.createSession({ name: fields.sessionName })

      // Stream the new session & update its dropdown entry
      emitter.emit(state.events.SESSION_SET, session)

      // Go back to the main tab so the new session is selectable
      window.location.hash = 'app'

      setSessions(state.sessions.concat([session]))
    } catch (err) {
      state.errors.push('Failed to create session: ' + err.message)
      emitter.emit(state.events.RENDER)
    }
  })

  emitter.on(state.events.SESSION_DELETE, async (session) => {
    const i = state.sessions.indexOf(session)
    if (i === -1) return

    try {
      const { success } = await state.rpc.deleteSession({ sessionId: session.id })
      if (!success) throw new Error('store rejected the delete')

      state.sessions.splice(i, 1)

      // Deleting the selected session: switch to the next latest session
      if (state.sessionID === session.id) {
        state.sessionID = null
        if (state.sessions.length) {
          emitter.emit(state.events.SESSION_SET, state.sessions[0])
        }
      }

      emitter.emit(state.events.RENDER)
    } catch (err) {
      state.errors.push('Failed to delete session: ' + err.message)
      emitter.emit(state.events.RENDER)
    }
  })
}
