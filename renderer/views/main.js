import html from 'choo/html'
import { textField } from './components/fields'
import { menuView } from './components/menu'
import { renderLatest } from './latest-stats'

export function mainView (state, emit) {
  const latestStats = renderLatest(state)
  const formState = state.formState
  const updateBanner = state.updateReady
    ? html`<div id="update">Update ready <button onclick=${onUpdateBtn}>Apply</button></div>`
    : ''

  return html`
<div>
  ${menuView(state, emit)}
  <div class="version">v${state.version}</div>
  ${updateBanner}
  <div class="errors">
    ${state.errors.map((error) => html`<div class="error">${error}</div>`)}
  </div>
    <div class="session-manager">
      <label for="session">Session</label>
      <select id="session" onchange=${onChangeSession}>
        ${state.sessions.map((session, i) =>
          html`<option value="${i}" ${state.sessions[i].id === state.sessionID ? 'selected' : ''}>${session.name}</option>`
          )}
      </select>
      <button class="pa4 black-80" onclick=${onAddSession}>Add session</button>
      <form class="pa4 black-80" onsubmit=${onSubmit} action="stoker-settings">
        <article class="cf">
          <div class="fl w-100 w-50-ns pa2">
            ${textField('stokerIP',
              'Stoker IP',
              formState.stokerIP, {
              oninput: stokerIPOnInput
              })
            }
            <div class="measure">
              <input type="submit" value="Save Settings" class="b ph3 pv2 input-reset bn bg-green grow pointer f6 dib white">
            </div>
          </div>
        </article>
      </form>
      <div class="latest-stats">
        ${latestStats}
      </div>
    </div>
</div>`

  function stokerIPOnInput () {
    emit(state.events.FORMSTATE_FIELDUPDATE, 'stokerIP', this.value)
  }

  function onSubmit (e) {
    e.preventDefault()
    const form = this
    // `form.action` is the base-url-resolved action (no hash), so the base
    // path must be derived from the hash-stripped pathname — the hash route
    // (`#session-management`) must not leak into the computed action
    const location = window.location.href.replace(/#.*$/, '')
    const basePath = location.replace(/\/[^/]*$/, '/')
    const action = form.action.replace(basePath, '')
    emit(`form-submit:${action}`, new FormData(form))
  }

  function onChangeSession (e) {
    e.preventDefault()

    const session = state.sessions[Number(e.target.value)]
    if (session) emit('session:set', session)
  }

  // Opens the session management tab (hash route), where the create session
  // form lives
  function onAddSession () {
    window.location.hash = 'session-management'
  }

  async function onUpdateBtn () {
    try {
      const res = await window.bridge.rpc.applyUpdate({})
      if (!res.ok) throw new Error(res.error || 'applyUpdate failed')
      await window.bridge.appAfterUpdate()
    } catch (e) {
      console.error('update failed: ' + e.message)
    }
  }
}
