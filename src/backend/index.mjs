import StokerServer from '../stoker-server.js'
import Store from '../store/index.mjs'

const STOKER_IP = '192.168.1.31'

const stokerServer = new StokerServer()
stokerServer.emit('sessions:set-dir', path.join(app.getPath('appData'), 'stoker-sessions'))
const store = new Store({
  name: 'stoker-ii'
})

// Stoker Server
if (store.get('stokerIP')) {
  stokerServer.emit('stoker:setip', store.get('stokerIP'))
} else {
  stokerServer.emit('stoker:setip', STOKER_IP)
  store.set('stokerIP', STOKER_IP)
}
store.onDidChange('stokerIP', (newIP, oldIP) => {
  if (newIP !== oldIP) {
    stokerServer.emit('stoker:setip', newIP)
  }
})
stokerServer.on('stoker:setip', (ip) => {
  store.set('stokerIP', ip)
})
stokerServer.on('error', (e) => {
  console.log('error', e)
})
