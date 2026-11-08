import html from 'choo/html'

// Hamburger menu: the ☰ summary is a click toggle. The open/closed state lives
// in app state (`state.menuOpen`) rather than the DOM because nano-morph
// rewrites the element on every render. When open, the summary is shown
// inverted in a square (see the CSS in renderer/index.html) and the tab links
// appear underneath it; the disclosure triangle is hidden with CSS
export function menuView (state, emit) {
  return html`
<details class="menu" ${state.menuOpen ? 'open' : ''}>
  <summary onclick=${toggleMenu}>☰</summary>
  <div class="menu-links">
    <a href="#app">Chart</a>
    <a href="#session-management">Sessions</a>
  </div>
</details>`

  function toggleMenu () {
    state.menuOpen = !state.menuOpen
    emit(state.events.RENDER)
  }
}
