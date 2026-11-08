import choo from 'choo'
import devtools from 'choo-devtools'
import { mainView } from './views/main'
import { bridgeStore } from './stores/bridge'
import { stokerStore } from './stores/stoker'
import { chartStore } from './stores/chart'
import { busStore } from './stores/bus'
import { formStore } from './stores/form-state'
import { sessionManagementStore } from './stores/session-management'
import { sessionManagementView } from './views/session-management'

// `hash: true` enables hash based routing, the session management tab
// switches tabs via `window.location.hash` (file:// pathnames never change in
// Electron)
const app = choo({ hash: true })
app.use(devtools())
app.use(busStore)
app.use(stokerStore)
app.use(chartStore)
app.use(formStore)
app.use(sessionManagementStore)
app.use(bridgeStore)
app.route('*', mainView)
app.route('/session-management', sessionManagementView)
app.mount('#app')
