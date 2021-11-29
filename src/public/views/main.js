const html = require('choo/html')
const renderLatest = require('./latest-stats')

function mainView (state, emit) {
  const latestStats = renderLatest(state)

  return html`
<div>
  <div class="errors">
    ${state.errors.map((error) => html`<div class="error">${error}</div>`)}
  </div>
    <div class="session-manager">
      <label for="session">Session</label>
      <select id="session" onchange=${onChangeSession}>
        ${state.sessions.map((session, i) =>
          html`<option value="${i}" ${i === state.sessionID ? 'selected' : ''}>${session.name}</option>`
          )}
      </select>
      <div class="latest-stats">
        ${latestStats}
      </div>
    </div>
</div>`

  function onChangeSession (e) {
    e.preventDefault()

    const id = Number(e.target.value)
    emit('session:set', id)
  }
}

module.exports = mainView
