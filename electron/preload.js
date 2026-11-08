// Runs in the Electron main world's isolated preload context: exposes the
// `window.bridge` API to the sandboxed renderer page and builds the HRPC
// client over the Bare worker's IPC channel.
// Ported from the hello-pear-electron boilerplate, extended with the `rpc`
// surface (the generated `spec/hrpc` client + a stream-like adapter).
const { contextBridge, ipcRenderer } = require('electron')
const EventEmitter = require('events')
const HRPC = require('../spec/hrpc/index.js')

const mainWorkerSpecifier = '/workers/main.mjs'

function toBuffer (data) {
  if (data === null || data === undefined || typeof data === 'number') return data
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
}

// Stream-like message pipe for the generated HRPC client. Frame boundaries
// come from the worker-side FramedStream(Bare.IPC) and the main-process
// FramedStream relay in electron/main.js, so the renderer consumes whole
// messages rather than re-framing raw bytes.
const adapter = new EventEmitter()
adapter.write = (data) => {
  ipcRenderer.invoke('pear:worker:writeIPC:' + mainWorkerSpecifier, data)
  return true
}
adapter.resume = () => {}
adapter.pause = () => {}
adapter.destroy = () => { adapter.destroying = true }
adapter.destroying = false

ipcRenderer.on('pear:worker:ipc:' + mainWorkerSpecifier, (evt, data) => {
  adapter.emit('data', toBuffer(data))
})

const rpc = new HRPC(adapter)

const workerEventListeners = []
rpc.onWorkerEvent((msg) => {
  for (const listener of workerEventListeners) listener(msg)
})

contextBridge.exposeInMainWorld('bridge', {
  pkg: () => ipcRenderer.sendSync('pkg'),
  appAfterUpdate: () => ipcRenderer.invoke('app:afterUpdate'),
  startWorker: (specifier) => ipcRenderer.invoke('pear:startWorker', specifier),
  rpc: {
    storeGet: (args) => rpc.storeGet(args),
    storeSet: (args) => rpc.storeSet(args),
    getSessions: (args) => rpc.getSessions(args),
    workerEvent: (args) => rpc.workerEvent(args),
    applyUpdate: (args) => rpc.applyUpdate(args),
    onWorkerEvent: (listener) => {
      workerEventListeners.push(listener)
      return () => workerEventListeners.splice(workerEventListeners.indexOf(listener), 1)
    },
    // Pass the data callback in as an argument: functions returned as object
    // properties do not cross the isolation boundary (structured clone error)
    sessionData: (args, onData) => {
      const stream = rpc.sessionData(args)
      if (onData) stream.on('data', onData)
    }
  },
  onWorkerStdout: (specifier, listener) => {
    const wrap = (evt, data) => listener(toBuffer(data))
    ipcRenderer.on('pear:worker:stdout:' + specifier, wrap)
    return () => ipcRenderer.removeListener('pear:worker:stdout:' + specifier, wrap)
  },
  onWorkerStderr: (specifier, listener) => {
    const wrap = (evt, data) => listener(toBuffer(data))
    ipcRenderer.on('pear:worker:stderr:' + specifier, wrap)
    return () => ipcRenderer.removeListener('pear:worker:stderr:' + specifier, wrap)
  },
  onWorkerExit: (specifier, listener) => {
    const wrap = (evt, code) => listener(code)
    ipcRenderer.on('pear:worker:exit:' + specifier, wrap)
    return () => ipcRenderer.removeListener('pear:worker:exit:' + specifier, wrap)
  }
})
