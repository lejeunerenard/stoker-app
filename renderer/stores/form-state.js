export function formStore (state, emitter) {
  // Blank state
  state = Object.assign(state, {
    formState: {
      stokerIP: null,
      // For the create-session form of the session management tab
      sessionName: ''
    }
  })

  state.events.FORMSTATE_FIELDUPDATE = 'form-state:field-update'

  emitter.on(state.events.FORMSTATE_FIELDUPDATE, (key, value) => {
    if (key in state.formState) {
      state.formState[key] = value
    } else {
      console.warn('cannot find key when updating form state', key)
    }
  })
}
