// Replaces the old Pear-global store (`stores/pear.js`). The Electron
// preload (`electron/preload.js`) has already built the HRPC client over the
// bridge IPC adapter — this store wires it into the choo app state.
export function bridgeStore (state, emitter) {
  const bridge = window.bridge
  const worker = '/workers/main.mjs'

  state.version = bridge.pkg().version

  bridge.startWorker(worker)

  bridge.onWorkerStdout(worker, (data) => {
    console.log('worker stdout:', new TextDecoder('utf-8').decode(data))
  })
  bridge.onWorkerStderr(worker, (data) => {
    console.error('worker stderr:', new TextDecoder('utf-8').decode(data))
  })

  // OTA update events surface via the HRPC `worker-event` op
  bridge.rpc.onWorkerEvent((evt) => {
    if (evt.name === 'updating' || evt.name === 'updated') {
      state.updateReady = evt.name === 'updated'
      emitter.emit('worker:event', evt)
      emitter.emit(state.events.RENDER)
    }
  })

  state.rpc = bridge.rpc
  emitter.emit('rpc:ready', state.rpc)
}
