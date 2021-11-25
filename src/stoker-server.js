const Stoker = require('./stoker')
const fs = require('fs')
const path = require('path')
const express = require('express')
const WebSocket = require('ws')

let stoker = null

const today = new Date()
const filename = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate() + '.json'
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
app.on('stoker:setwsport', (port) => {
  const wss = new WebSocket.Server({ port })
  wss.on('connection', (ws) => {
    console.log('client connected')

    stoker.on('data', (data) => {
      ws.send(JSON.stringify({
        event: 'data',
        data: data
      }))
    })

    // Relay via websocket
    app.on('stoker:not-found', () => {
      ws.send(JSON.stringify({
        event: 'stoker:not-found',
        data: null
      }))
    })

    ws.on('message', (msg) => {
      if (msg instanceof Buffer) msg = msg.toString()
      let event, data
      try {
        const json = JSON.parse(msg)
        event = json.event
        data = json.data
      } catch (e) { return } // skip non JSON messages

      switch (event) {
        case 'store:get':
          if (data === 'stokerIP') {
            ws.send(JSON.stringify({
              event: 'store:get:stokerIP',
              data: stoker.ip
            }))
          }
          break
      }
    })
  })

  app.get('/ws-port', (req, res) => {
    res.send(JSON.stringify(port))
  })
})

app.use(express.static('src/public'))

app.get('/data', (req, res) => {
  res.send(JSON.stringify(currentSessionData))
})

module.exports = app
