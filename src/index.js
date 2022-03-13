const os = require('os')
const { app, Menu, dialog, BrowserWindow, ipcMain } = require('electron')
const net = require('net')

const fs = require('fs')
const path = require('path')
const Store = require('electron-store')

const STOKER_IP = '192.168.1.31'

const stokerServer = require('./stoker-server')
stokerServer.emit('sessions:set-dir', path.join(app.getPath('appData'), 'stoker-sessions'))
const store = new Store({
  name: 'stoker-ii'
})

const { PORT } = require('./variables.json')

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) { // eslint-disable-line global-require
  return app.quit()
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true
    }
  })

  // and load the index.html of the app.
  mainWindow.loadURL(`file://${__dirname}/public/app-renderer.html`)

  // Open the DevTools.
  if (process.env.ELECTRON_ENV === 'development') {
    mainWindow.webContents.openDevTools()
  }

  // Emitted when the window is closed.
  mainWindow.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  })

  // Create the Application's main menu
  const template = [{
    label: 'Application',
    submenu: [
      { label: 'About Application', selector: 'orderFrontStandardAboutPanel:' },
      { type: 'separator' },
      { label: 'Quit', accelerator: 'Command+Q', click: function() { app.quit() }}
    ]}, {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', selector: 'undo:' },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', selector: 'redo:' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', selector: 'cut:' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', selector: 'copy:' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', selector: 'paste:' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', selector: 'selectAll:' }
      ]}
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow()
  }
})

app.on('renderer-process-crashed', (event, webContents, killed) => {
  console.error('crash renderer')
  console.error('event', event, 'webContents', webContents, 'killed', killed)
})

// Setup Settings IPC redirect
ipcMain.on('store:set', (event, { field, data }) => {
  store.set(field, data)
})

ipcMain.on('store:get', (event, field) => {
  event.sender.send('store:get:' + field, store.get(field))
})

// Stoker Server
if (store.get('stokerIP')) {
  stokerServer.emit('stoker:setip', store.get('stokerIP'))
} else {
  stokerServer.emit('stoker:setip', STOKER_IP)
  store.set('stokerIP', STOKER_IP)
}

// Get WS PORT
function portInUse (port, callback) {
  let server = net.createServer(function(socket) {
    socket.write('Echo server\r\n');
    socket.pipe(socket)
  })

  server.on('error', function (e) {
    callback(true)
  })
  server.on('listening', function (e) {
    server.close()
    callback(false)
  })

  server.listen(port, '0.0.0.0')
}

async function findPort (port = 5011) {
  let isUsed = await new Promise((resolve, reject) => {
    portInUse(port, resolve)
  })

  if (isUsed) return findPort(port + 1)

  return port
}

(async () => {
  const WS_PORT = await findPort()
  stokerServer.emit('stoker:setwsport', WS_PORT)
})()

stokerServer.listen(PORT, () => {
  console.log(`Website listening at http://localhost:${PORT}`)
})
stokerServer.on('error', (e) => {
  console.log('error', e)
})
