import html from 'choo/html'
import { textField } from './components/fields'
import { menuView } from './components/menu'

export function sessionManagementView (state, emit) {
  return html`
<div>
  ${menuView(state, emit)}
  <div class="errors">
    ${state.errors.map((error) => html`<div class="error">${error}</div>`)}
  </div>
  <div class="session-management">
    <div class="f6 b db mb2">Sessions</div>
    <form class="pa4 black-80" onsubmit=${onSubmit} action="create-session">
      <article class="cf">
        <div class="fl w-100 w-50-ns pa2">
          ${textField('sessionName',
            'Session Name',
            state.formState.sessionName, {
            oninput: sessionNameOnInput
            })
          }
          <div class="measure">
            <input type="submit" value=${state.editingSession ? 'Save Session' : 'Create Session'} class="b ph3 pv2 input-reset bn bg-green grow pointer f6 dib white">
          </div>
        </div>
      </article>
    </form>
    <div class="session-list">
      ${state.sessions.length
        ? html`<table class="session-table">
          <tbody>
            ${state.sessions.map((session, i) =>
              html`<tr>
                <td>${session.name}</td>
                <td><button class="pa4 black-80" data-index="${i}" onclick=${onEditSession}>✎</button></td>
                <td><button class="pa4 black-80" data-index="${i}" onclick=${onDeleteSession}>✕</button></td>
              </tr>`
            )}
          </tbody>
        </table>`
        : html`<div class="f6 b db mb2">No sessions yet, create one above</div>`}
    </div>
  </div>
</div>`

  function sessionNameOnInput () {
    emit(state.events.FORMSTATE_FIELDUPDATE, 'sessionName', this.value)
  }

  function onSubmit (e) {
    e.preventDefault()
    const form = this
    // TODO abstract this issue / fix into something used in each form
    // Same as mainView: strip the hash route from the page location before
    // deriving the base path, `form.action` never carries the hash
    const location = window.location.href.replace(/#.*$/, '')
    const basePath = location.replace(/\/[^/]*$/, '/')
    const action = form.action.replace(basePath, '')
    emit(`form-submit:${action}`, new FormData(form))
  }

  function onEditSession () {
    const session = state.sessions[Number(this.dataset.index)]
    if (session) emit(state.events.SESSION_EDIT, session)
  }

  function onDeleteSession () {
    const session = state.sessions[Number(this.dataset.index)]
    if (session) emit(state.events.SESSION_DELETE, session)
  }
}
