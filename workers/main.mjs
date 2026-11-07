// Bare worker: hosts pear-runtime (OTA updates) and the stoker backend.
// Ported from `src/backend/index.mjs` (the old "pearend"). Node-only APIs
// are routed through the package.json#imports map (bare-fs, bare-http1,
// bare-path, bare-querystring, bare-events, bare-assert).
import FramedStream from 'framed-stream'
import path from 'path'
import PearRuntime from 'pear-runtime'
import Hyperswarm from 'hyperswarm'
import Corestore from 'corestore'
import goodbye from 'graceful-goodbye'
import storage from 'bare-storage'
import StokerServer from './stoker-server.js'
import { Store } from './store/index.mjs'
import HRPC from '../spec/hrpc/index.js'

console.log('Starting worker')

const STOKER_IP = '192.168.1.31'

// Positional argv from PearRuntime.run (see electron/main.js):
// [updates, version, upgrade, appName+extension, storageDir, appPath].
// In Bare argv[0]/argv[1] are the executable and worker entry point.
const argv = (i) => Bare.argv[i + 2]

const updaterConfig = {
  updates: argv(0) !== 'false',
  version: argv(1),
  upgrade: argv(2),
  name: argv(3),
  dir: argv(4) || storage.persistent(),
  app: argv(5)
}

const pipe = new FramedStream(Bare.IPC)

const corestore = new Corestore(path.join(updaterConfig.dir, 'pear-runtime', 'corestore'))
const swarm = new Hyperswarm()
const runtime = new PearRuntime({ ...updaterConfig, swarm, store: corestore })

runtime.updater.on('error', (err) => pipe.write('updater-error ' + err.message))

if (updaterConfig.updates !== false) {
  swarm.on('connection', (connection) => corestore.replicate(connection))
  swarm.join(runtime.updater.drive.core.discoveryKey, {
    client: true,
    server: false
  })
}

const rpc = new HRPC(pipe)

// Forward OTA events to the renderer over HRPC (`worker-event` op)
runtime.updater.on('updating', () => rpc.workerEvent({ name: 'updating' }))
runtime.updater.on('updated', () => rpc.workerEvent({ name: 'updated' }))
runtime.updater.on('update-scheduled', () => rpc.workerEvent({ name: 'update-scheduled' }))

rpc.onApplyUpdate(async () => {
  try {
    await runtime.ready()
    await runtime.updater.applyUpdate()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

const stokerServer = new StokerServer()
stokerServer.emit('sessions:set-dir', path.join(updaterConfig.dir, 'stoker-sessions'))
const store = new Store({
  path: path.join(updaterConfig.dir, 'stoker-ii')
})

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

rpc.onStoreGet(async ({ key }) => {
  return { value: await store.get(key) }
})

rpc.onStoreSet(async ({ key, value }) => {
  const success = store.set(key, value)
  return { success }
})

rpc.onGetSessions(async () => {
  const sessions = [
    {
      id: {
        createdOn: new Date(),
        key: Buffer.from('deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', 'hex')
      },
      name: 'Test Session'
    }
  ]

  return { sessions }
})

rpc.onSessionData((stream) => {
  const { sessionId } = stream.data
  console.log('Getting data for sessionId', sessionId)
  stokerServer.on('data', (data) => {
    const timestamp = new Date(data.timestamp)
    const sensors = data.stoker.sensors.map((sensor) => ({
      name: sensor.name,
      tempCurrent: sensor.tc,
      timestamp
    }))
    stream.write({ sensors })
  })
})

async function teardown () {
  stokerServer.close()
  await pipe.destroy()
}
pipe.on('close', teardown)
pipe.on('end', teardown)

goodbye(async () => {
  await swarm.destroy()
  await runtime.close()
  await corestore.close()
})

console.log('Worker started')
