const Stoker = require('./stoker')
const { EventEmitter } = require('events')

class StokerServer {
  constructor () {
    this.stoker = null
    this.wss = null
    this.pollPeriod = 5 * 1000

    const app = new EventEmitter() // express()
    this.app = app

    // // Adding data to sessions needs to be implemented, might need to use the store directly
    // this.on('data', (data) => {
    //   currentSession.data.push(data)
    //   saveSession(currentSession, sessionDir)
    // })

    const setupStoker = (ip) => {
      if (this.stoker) this.stoker.close()

      this.stoker = new Stoker(ip, this.pollPeriod)

      this.stoker.on('temp', (data) => {
        console.log(data.name + ' : ' + data.temperature)
      })

      this.stoker.on('data', (data) => {
        this.emit('data', data)
      })

      this.stoker.on('error', (e) => {
        if (e.code === 'EHOSTUNREACH' || e.code === 'EHOSTDOWN' || e.code === 'ETIMEDOUT' || e.code === 'ECONNABORTED' || e.code === 'ECONNREFUSED') {
          app.emit('stoker:not-found')
        } else {
          throw e
        }
      })
    }

    app.on('stoker:setip', setupStoker)

    // TODO Ensure the initial data request still works w/ the HRPC endpoint
    // app.get('/data/:id', (req, res) => {
    //   if (!('id' in req.params)) {
    //     return res.send(400)
    //   }

    //   let id = req.params.id
    //   if (id === 'current') {
    //     id = sessions.length - 1
    //   }
    //   id = Number(id)

    //   const session = sessions[id]

    //   res.send(JSON.stringify(session))
    // })

    // app.get('/sessions', (req, res) => {
    //   res.send(JSON.stringify(sessions))
    // })
  }

  emit (event, ...args) {
    this.app.emit(event, ...args)
  }

  on (event, ...args) {
    this.app.on(event, ...args)
  }

  close () {
    if (this.stoker) this.stoker.close()
  }
}

module.exports = StokerServer
