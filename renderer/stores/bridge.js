import HRPC from '../../spec/hrpc/index.js'
import { Duplex } from 'streamx'

const decoder = new TextDecoder('utf-8')

export function bridgeStore (state, emitter) {
  const bridge = window.bridge
  const workers = {
    main: '/workers/main.mjs'
  }

  state.version = bridge.pkg().version

  bridge.startWorker(workers.main)

  const workerStream = new Duplex({
    write (data, cb) {
      window.bridge.writeWorkerIPC(workers.main, data)
      cb()
    },
    final (cb) {
      cb(null)
    }
  })

  const rpc = new HRPC(workerStream)

  bridge.onWorkerIPC(workers.main, (data) => {
    workerStream.emit('data', data)
  })

  bridge.onWorkerExit(workers.main, () => {
    workerStream.destroy()
  })

  rpc.onWorkerStarted(() => {
    emitter.emit('rpc:ready', state.rpc)
  })

  bridge.onWorkerStdout(workers.main, (data) => {
    console.log('worker stdout:', decoder.decode(data))
  })

  bridge.onWorkerStderr(workers.main, (data) => {
    console.error('worker stderr:', decoder.decode(data))
  })

  // `worker-event` carries OTA update state only
  rpc.onWorkerEvent((evt) => {
    if (evt.name === 'updating' || evt.name === 'updated') {
      state.updateReady = evt.name === 'updated'
      emitter.emit('worker:event', evt)
      emitter.emit(state.events.RENDER)
    }
  })

  rpc.onStokerNotFound(() => {
    emitter.emit('stoker:not-found')
  })

  rpc.onStokerError((msg) => {
    emitter.emit('stoker:error', msg)
  })

  state.rpc = {
    storeGet: (args) => rpc.storeGet(args),
    storeSet: (args) => rpc.storeSet(args),
    getSessions: (args) => rpc.getSessions(args),
    createSession: (args) => rpc.createSession(args),
    editSession: (args) => rpc.editSession(args),
    deleteSession: (args) => rpc.deleteSession(args),
    workerEvent: (args) => rpc.workerEvent(args),
    applyUpdate: (args) => rpc.applyUpdate(args),
    // The worker keeps this response stream open until the renderer closes it,
    // so the returned closer is the only way the stream ends: hrpc v4's client
    // RPCStream fires no `end`/`close` of its own anyway (see
    // renderer/stores/stoker.js for how the closer is held)
    sessionData: (args, onData, onError) => {
      const stream = rpc.sessionData(args)
      if (onData) stream.on('data', onData)
      if (onError) {
        stream.on('error', (err) => onError(err && err.message ? err.message : String(err)))
      }
      return () => stream.destroy()
    }
  }
}
