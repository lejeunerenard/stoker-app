import FramedStream from 'framed-stream'
import path from 'path'
import StokerServer from '../stoker-server.js'
import { Store } from '../store/index.mjs'
import HRPC from '../../spec/hrpc/index.js'

console.log('Starting pearend')
const STOKER_IP = '192.168.1.31'

const stokerServer = new StokerServer()
stokerServer.emit('sessions:set-dir', path.join(Pear.config.storage, 'stoker-sessions'))
const store = new Store({
  path: path.join(Pear.config.storage, 'stoker-ii')
})

// Stoker Server
const stokerIP = await store.get('stokerIP')
if (stokerIP) {
  stokerServer.emit('stoker:setip', stokerIP)
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

const worker = Pear.worker.pipe()

const pipe = new FramedStream(worker)
const rpc = new HRPC(pipe)

async function teardown () {
  worker.destroy()
}
worker.on('close', teardown)
worker.on('end', teardown)

rpc.onStoreGet(async ({ key }) => store.get(key))

rpc.onStoreSet(async ({ key, value }) => {
  const success = store.set(key, value)
  return { success }
})

console.log('Pearend started')
