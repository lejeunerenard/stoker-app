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

// The worker polls the timeseries-db on this period; the renderer follows one
// live `session-data` stream instead of scheduling its own fetches
const POLL_PERIOD_MS = 5 * 1000

// how far the cursor is rewound on follow-up queries. A series row is created
// by the same flush as a field's first datapoint, so a query whose `findSeries`
// scan ran before that flush cannot see the new field at all; re-querying a
// window covers it, `seen` dedupes the overlap
const CHART_BACKFILL_MS = 60 * 1000

function sleep (ms) {
  return new Promise((cb) => setTimeout(cb, ms))
}

// `session-data` is one live stream per session: it stays open until the
// renderer closes it (`stream.destroy()` sends the bare-rpc DESTROY frame,
// which destroys this side and marks the stream destroyed — the loop check
// below is what stops the polling). Polling the db is this handler's job: the
// renderer just reads chunks as they arrive and re-opens the stream with a
// `since` cursor when it comes back to the chart view
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

  // newest timestamp delivered; each query rewinds it by CHART_BACKFILL_MS, so
  // `seen` is kept to that window and holds every name+timestamp a future
  // query can re-request. It is kept as a number: the query bound below has
  // to be a Date, the hyperdb timestamp columns are compact-encoded as dates
  let cursor = since ? Number(since) : null
  const seen = new Map()

  while (!stream.destroyed) {
    const lower = cursor === null
      ? null
      : new Date(Math.max(0, cursor - CHART_BACKFILL_MS))
    let points

    try {
      points = await store.getSessionDatapoints(sessionId, lower)
    } catch (err) {
      // the query failed, the stream did not: stay put and retry next period,
      // so one bad scan does not end the live feed
      console.log('session data query error', err)
      await sleep(POLL_PERIOD_MS)
      continue
    }

    const fresh = []
    for (const point of points) {
      const timestamp = Number(point.timestamp)
      let names = seen.get(timestamp)
      if (!names) {
        names = new Set()
        seen.set(timestamp, names)
      }
      if (names.has(point.name)) continue
      names.add(point.name)
      fresh.push(point)
      if (cursor === null || timestamp > cursor) cursor = timestamp
    }

    if (cursor !== null) {
      const floor = Number(cursor) - CHART_BACKFILL_MS
      for (const timestamp of seen.keys()) {
        if (timestamp < floor) seen.delete(timestamp)
      }
    }

    try {
      const batchSize = 100
      for (let i = 0; i < fresh.length; i += batchSize) {
        stream.write({ sensors: fresh.slice(i, i + batchSize) })
      }
    } catch (err) {
      // streamx drops writes to a closed stream, so the loop check above is
      // what normally ends this: the catch covers a stream that errors out
      console.log('session data write error', err)
      break
    }

    await sleep(POLL_PERIOD_MS)
  }

  stream.end()
})

// the stoker starts polling on boot ensure there is a session to attribute it to
try {
  const bootSessions = await store.getSessions()

  if (!bootSessions.length) {
    const starter = await store.createSession({
      name: `Starter ${new Date().toISOString().slice(0, 10)}`
    })
    await store.set('currentSession', toHex(starter.id.key))
  } else {
    let latest = bootSessions[0]
    for (const session of bootSessions) {
      if (session.id.createdOn > latest.id.createdOn) latest = session
    }

    const latestKey = toHex(latest.id.key)
    if (await store.get('currentSession') !== latestKey) {
      await store.set('currentSession', latestKey)
    }
  }
} catch (err) {
  console.log('boot session setup error', err)
}

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

stokerServer.on('stoker:not-found', () => rpc.stokerNotFound())
stokerServer.on('stoker:error', ({ message }) => rpc.stokerError({ message }))

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
