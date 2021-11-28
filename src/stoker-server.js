const Stoker = require('./stoker')
const { loadSessions, createSession } = require('./sessions')
const path = require('path')
const express = require('express')
const WebSocket = require('ws')

let stoker = null

const SESSION_DIR = path.join('.', 'sessions')
const sessions = loadSessions(SESSION_DIR)

const app = express()

function setupStoker (ip) {
  stoker = new Stoker(ip)

  // Start a new session
  sessions.push(createSession())

  stoker.on('temp', (data) => {
    console.log(data.name + ' : ' + data.temperature)
  })

  stoker.on('data', (data) => {
    const currentSession = sessions[sessions.length - 1]
    currentSession.data.push(data)
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

app.get('/data/:id', (req, res) => {
  if (!('id' in req.params)) {
    return res.send(400)
  }

  let id = req.params.id
  if (id === 'current') {
    id = sessions.length - 1
  }
  id = Number(id)

  const session = sessions[id]

  res.send(JSON.stringify(session))
})

app.get('/sessions', (req, res) => {
  res.send(JSON.stringify(sessions))
})

module.exports = app
