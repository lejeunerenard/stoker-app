const Stoker = require('../')
const fs = require('fs')
const path = require('path')
const express = require('express')
const WebSocket = require('ws')

const PORT = 4000
const WS_PORT = 4001
const STOKER_IP = '192.168.1.31'

const stoker = new Stoker(STOKER_IP)

const today = new Date()
const filename = today.getFullYear() + '-' + today.getMonth() + '-' + today.getDate() + '.json'
const currentSessionData = []

const app = express()

stoker.on('temp', (data) => {
  console.log(data.name + ' : ' + data.temperature)
})

stoker.on('data', (data) => {
  currentSessionData.push(data)
  const json = JSON.stringify(currentSessionData, null, 2)
  fs.writeFileSync(path.join('.', filename), json, 'utf8')
})

app.use(express.static('public'))

app.get('/data', (req, res) => {
  res.send(JSON.stringify(currentSessionData))
})

app.listen(PORT, () => {
  console.log(`Website listening at http://localhost:${PORT}`)
})

const wss = new WebSocket.Server({ port: WS_PORT })
wss.on('connection', (ws) => {
  console.log('client connected')

  stoker.on('data', (data) => {
    ws.send(JSON.stringify(data))
  })
})

// const sensorsConnectedToBlower = ['01000012C22AA130']
// stoker.setBlower(false, sensorsConnectedToBlower)
