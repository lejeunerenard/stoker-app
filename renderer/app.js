import choo from 'choo'
import devtools from 'choo-devtools'
import { mainView } from './views/main'
import { bridgeStore } from './stores/bridge'
import { stokerStore } from './stores/stoker'
import { chartStore } from './stores/chart'
import { busStore } from './stores/bus'
import { formStore } from './stores/form-state'

const app = choo()
app.use(devtools())
app.use(busStore)
app.use(stokerStore)
app.use(chartStore)
app.use(formStore)
app.use(bridgeStore)
app.route('*', mainView)
app.mount('#app')
