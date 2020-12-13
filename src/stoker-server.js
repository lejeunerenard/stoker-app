const Stoker = require('./stoker')
const fs = require('fs')
const path = require('path')
const express = require('express')
const WebSocket = require('ws')

const { WS_PORT } = require('./variables.json')

let stoker = null

const today = new Date()
const filename = today.getFullYear() + '-' + today.getMonth() + '-' + today.getDate() + '.json'
const currentSessionData = []

const app = express()

function setupStoker (ip) {
  stoker = new Stoker(ip)
  stoker.on('temp', (data) => {
    console.log(data.name + ' : ' + data.temperature)
  })

  stoker.on('data', (data) => {
    currentSessionData.push(data)
    const json = JSON.stringify(currentSessionData, null, 2)
    fs.writeFileSync(path.join('.', filename), json, 'utf8')
  })
  stoker.on('error', (e) => {
    if (e.code === 'EHOSTUNREACH' || e.code === 'EHOSTDOWN' || e.code === 'ETIMEDOUT') {
      app.emit('stoker:not-found')
    } else {
      throw e
    }
  })
}

app.on('stoker:setip', setupStoker)

app.use(express.static('public'))

app.get('/data', (req, res) => {
  res.send(JSON.stringify(currentSessionData))
})

const wss = new WebSocket.Server({ port: WS_PORT })
wss.on('connection', (ws) => {
  console.log('client connected')

  stoker.on('data', (data) => {
    ws.send(JSON.stringify(data))
  })
})

module.exports = app
