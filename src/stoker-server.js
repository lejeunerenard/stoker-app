const Stoker = require('./stoker')
const { loadSessions, createSession, saveSession } = require('./sessions')
const path = require('path')
const express = require('express')
const WebSocket = require('ws')
const mkdirp = require('mkdirp')

class StokerServer {
  constructor () {
    this.stoker = null
    this.wss = null
    this.pollPeriod = 5 * 1000

    let sessionDir = path.join('.', 'sessions')
    let sessions = []
    let currentSession = null

    const app = express()

    const setupStoker = (ip) => {
      if (this.stoker) this.stoker.close()

      this.stoker = new Stoker(ip, this.pollPeriod)

      // Start a new session
      currentSession = createSession()
      sessions.push(currentSession)
      saveSession(currentSession, sessionDir)

      this.stoker.on('temp', (data) => {
        console.log(data.name + ' : ' + data.temperature)
      })

      this.stoker.on('data', (data) => {
        currentSession.data.push(data)
        saveSession(currentSession, sessionDir)
      })

      this.stoker.on('error', (e) => {
        if (e.code === 'EHOSTUNREACH' || e.code === 'EHOSTDOWN' || e.code === 'ETIMEDOUT' || e.code === 'ECONNABORTED') {
          app.emit('stoker:not-found')
        } else {
          throw e
        }
      })
    }

    app.on('stoker:setip', setupStoker)
    app.on('stoker:setwsport', (port) => {
      if (this.wss) this.wss.close()

      this.wss = new WebSocket.Server({ port })
      this.wss.on('connection', (ws) => {
        console.log('client connected')

        this.stoker.on('data', (data) => {
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
                  data: this.stoker.ip
                }))
              }
              break
            case 'store:set':
              if (data[0] === 'stokerIP') {
                this.emit('stoker:setip', data[1])
              }
              break
          }
        })
      })

      app.get('/ws-port', (req, res) => {
        res.send(JSON.stringify(port))
      })
    })

    app.on('sessions:set-dir', (dir) => {
      sessionDir = dir
      mkdirp(sessionDir).then(() => {
        sessions = sessions.concat(loadSessions(sessionDir))
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

    this.app = app
  }

  emit (event, ...args) {
    this.app.emit(event, ...args)
  }

  on (event, ...args) {
    this.app.on(event, ...args)
  }

  listen (...args) {
    this.app.listen(...args)
  }

  close () {
    if (this.wss) this.wss.close()
    if (this.stoker) this.stoker.close()
  }
}

module.exports = StokerServer
