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
import { Store, toHex } from './store/index.mjs'
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
const store = new Store({
  path: path.join(updaterConfig.dir, 'stoker-ii')
})

// Register handlers synchronously: the renderer is already connected over the
// bridge and can send (e.g. `store:get`) before any await resumes this module
rpc.onStoreGet(async ({ key }) => {
  return { value: await store.get(key) }
})

rpc.onStoreSet(async ({ key, value }) => {
  const success = await store.set(key, value)
  return { success }
})

rpc.onGetSessions(async () => {
  const sessions = await store.getSessions()

  return { sessions }
})

rpc.onCreateSession((fields) => {
  return store.createSession(fields)
})

rpc.onEditSession(({ sessionId, name }) => {
  return store.updateSession(sessionId, name)
})

rpc.onDeleteSession(async ({ sessionId }) => {
  return { success: await store.deleteSession(sessionId) }
})

// per-poll/per-fetch chatter
const DEBUG = false
const logDebug = DEBUG ? (line) => console.log(line) : () => {}

// The single writer into the timeseries-db overlay: one record per stoker
// poll (measurement 'stoker', session tag, field sensor name); the renderer
// reads it back through `session-data`
stokerServer.on('data', async (data) => {
  try {
    const recorded = await store.recordStoker(data)
    logDebug(`recorded ${recorded.length} datapoints`)
  } catch (err) {
    console.log('record error', err)
  }
})

// `session-data` answers one fetch: the datapoints for a session at or after
// `since`. Streams are finite — hrpc v4 gives the client no response-end
// event, so the renderer re-requests each poll period with a `since` cursor
// rather than following an open stream. `stream.end()` emits the bare-rpc
// END frame, releasing the response stream and its request bookkeeping
rpc.onSessionData(async (stream) => {
  // `stream.data` is handed over before the request decodes: a synchronous
  // throw here would be an unhandled rejection that ends the worker
  const request = stream.data
  if (!request || !request.sessionId || !request.sessionId.key) {
    logDebug('session-data request without a sessionId')
    stream.end()
    return
  }

  const { sessionId, since } = request

  // an unparsable cursor would silently blank the chart
  if (since && Number(since) !== Number(since)) {
    logDebug('session-data since is not a valid date')
    stream.end()
    return
  }

  logDebug(`session-data for ${toHex(sessionId.key)} since ${since}`)

  try {
    const points = await store.getSessionDatapoints(sessionId, since)
    const batchSize = 100
    for (let i = 0; i < points.length; i += batchSize) {
      stream.write({ sensors: points.slice(i, i + batchSize) })
    }
  } catch (err) {
    // a fetch the client cancelled mid-stream throws writes here
    console.log('session data query error', err)
  }

  stream.end()
})

// top-level await here would be an uncaught rejection at boot
let stokerIP = null
try {
  stokerIP = await store.get('stokerIP')
} catch (err) {
  console.log('boot config read error', err)
}
if (stokerIP) {
  stokerServer.emit('stoker:setip', stokerIP)
} else {
  stokerServer.emit('stoker:setip', STOKER_IP)
  store.set('stokerIP', STOKER_IP).catch((err) => console.log('store set error', err))
}
store.onDidChange('stokerIP', (newIP, oldIP) => {
  if (newIP !== oldIP) {
    stokerServer.emit('stoker:setip', newIP)
  }
})
stokerServer.on('stoker:setip', (ip) => {
  // unawaited: a rejection here would be an unhandled one
  store.set('stokerIP', ip).catch((err) => console.log('store set error', err))
})

stokerServer.on('stoker:not-found', () => rpc.workerEvent({ name: 'stoker:not-found' }))
stokerServer.on('stoker:error', ({ message }) => {
  rpc.workerEvent({ name: 'stoker:error', message })
})

stokerServer.on('error', (e) => {
  console.log('error', e)
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
rpc.workerStarted()
