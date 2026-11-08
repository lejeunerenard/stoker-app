// Electron host process: owns the app (Electron Forge), embeds pear-runtime
// in a Bare worker (`workers/main.js`) and relays worker IPC to the renderer.
// Ported from the hello-pear-electron boilerplate, trimmed for this app
// (no deep links, no store signing layers).
const { app, BrowserWindow, ipcMain } = require('electron')
const os = require('os')
const path = require('path')
const PearRuntime = require('pear-runtime')
const FramedStream = require('framed-stream')

const { isMac, isLinux, isWindows } = require('which-runtime')
const { command, flag } = require('paparam')
const pkg = require('../package.json')
const { name, productName, version, upgrade } = pkg

const appName = productName ?? name

const workers = new Map()

const cmd = command(
  appName,
  flag('--storage <dir>', 'pass custom storage to pear-runtime'),
  flag('--no-updates', 'start without OTA updates')
)

cmd.parse(app.isPackaged ? process.argv.slice(1) : process.argv.slice(2))

const pearStore = cmd.flags.storage
const updates = cmd.flags.updates

if (pearStore) app.setPath('userData', pearStore)

ipcMain.on('pkg', (evt) => {
  evt.returnValue = pkg
})

function getAppPath () {
  if (!app.isPackaged) return null
  if (isLinux && process.env.APPIMAGE) return process.env.APPIMAGE
  if (isWindows) return process.execPath
  return path.join(process.resourcesPath, '..', '..')
}

function sendToAll (name, data) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(name, data)
  }
}

function shouldUpdate () {
  if (!updates) return false
  if (isWindows) {
    return (process.windowsStore ?? false) ? app.isPackaged : false
  }
  if (isMac) {
    if (process.mas) return false
    return app.isPackaged
  }
  return app.isPackaged
}

function getWorker (specifier) {
  if (workers.has(specifier)) return workers.get(specifier)

  const appPath = getAppPath()
  let dir = null
  if (pearStore) {
    dir = pearStore
  } else if (appPath === null) {
    dir = path.join(os.tmpdir(), 'pear', appName)
  } else {
    const isSnap = !!process.env.SNAP_USER_COMMON
    const linuxConfigHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
    dir = isMac
      ? path.join(os.homedir(), 'Library', 'Application Support', appName)
      : isLinux
        ? isSnap
            ? path.join(process.env.SNAP_USER_COMMON, appName)
            : path.join(linuxConfigHome, appName)
        : path.join(os.homedir(), 'AppData', 'Local', appName)
  }

  const extension = isLinux ? '.AppImage' : isMac ? '.app' : '.msix'

  // Arguments are positional for the Bare worker (see workers/main.js)
  const worker = PearRuntime.run(require.resolve('..' + specifier), [
    shouldUpdate(),
    version,
    upgrade,
    productName + extension,
    dir,
    appPath
  ])
  const pipe = new FramedStream(worker)

  function sendWorkerStdout (data) {
    sendToAll('pear:worker:stdout:' + specifier, data)
  }
  function sendWorkerStderr (data) {
    sendToAll('pear:worker:stderr:' + specifier, data)
  }
  function sendWorkerIPC (data) {
    sendToAll('pear:worker:ipc:' + specifier, data)
  }
  function onBeforeQuit () {
    pipe.destroy()
  }

  ipcMain.handle('pear:worker:writeIPC:' + specifier, (evt, data) => {
    return pipe.write(data)
  })

  workers.set(specifier, pipe)
  pipe.on('data', sendWorkerIPC)
  worker.stdout.on('data', sendWorkerStdout)
  worker.stderr.on('data', sendWorkerStderr)
  worker.once('exit', (code) => {
    app.removeListener('before-quit', onBeforeQuit)
    ipcMain.removeHandler('pear:worker:writeIPC:' + specifier)
    pipe.removeListener('data', sendWorkerIPC)
    worker.stdout.removeListener('data', sendWorkerStdout)
    worker.stderr.removeListener('data', sendWorkerStderr)
    sendToAll('pear:worker:exit:' + specifier, code)
    workers.delete(specifier)
  })
  app.on('before-quit', onBeforeQuit)

  return pipe
}

async function createWindow () {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      // The renderer consumes Node libs (hrpc/framed-stream) through the
      // preload-built bridge, so it runs with node integration disabled but
      // not Chromium-sandboxed (preload needs `require` for those libs)
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
}

ipcMain.handle('pear:startWorker', (evt, filename) => {
  getWorker(filename)
  return true
})

ipcMain.handle('app:afterUpdate', () => {
  if (isLinux && process.env.APPIMAGE) {
    app.relaunch({
      execPath: process.env.APPIMAGE,
      args: [
        '--appimage-extract-and-run',
        ...process.argv.slice(1).filter((arg) => arg !== '--appimage-extract-and-run')
      ]
    })
  } else if (!isWindows) {
    app.relaunch()
  }
  app.quit()
})

app.whenReady().then(() => {
  createWindow().catch((err) => {
    console.error('Failed to create window:', err)
    app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch((err) => {
        console.error('Failed to create window:', err)
      })
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
