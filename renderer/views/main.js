import html from 'choo/html'
import { textField } from './components/fields'
import { renderLatest } from './latest-stats'

export function mainView (state, emit) {
  const latestStats = renderLatest(state)
  const formState = state.formState
  const updateBanner = state.updateReady
    ? html`<div id="update">Update ready <button onclick=${onUpdateBtn}>Apply</button></div>`
    : ''

  return html`
<div>
  <div class="version">v${state.version}</div>
  ${updateBanner}
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
    const basePath = window.location.href.replace(/\/[^/]*.html/, '/')
    const action = form.action.replace(basePath, '')
    emit(`form-submit:${action}`, new FormData(form))
  }

  function onChangeSession (e) {
    e.preventDefault()

    const id = Number(e.target.value)
    emit('session:set', id)
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
