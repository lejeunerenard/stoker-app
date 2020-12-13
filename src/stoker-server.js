const Stoker = require('./stoker')
const fs = require('fs')
const path = require('path')
const express = require('express')
const WebSocket = require('ws')

const { WS_PORT } = require('./variables.json')
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

const wss = new WebSocket.Server({ port: WS_PORT })
wss.on('connection', (ws) => {
  console.log('client connected')

  stoker.on('data', (data) => {
    ws.send(JSON.stringify(data))
  })
})

module.exports = app
