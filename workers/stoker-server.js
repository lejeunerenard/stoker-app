const Stoker = require('./stoker')
const { EventEmitter } = require('events')

class StokerServer extends EventEmitter {
  constructor () {
    super()

    this.stoker = null
    this.wss = null
    this.pollPeriod = 5 * 1000

    this.on('stoker:setip', (ip) => {
      if (this.stoker) this.stoker.close()

      this.stoker = new Stoker(ip, this.pollPeriod)

      this.stoker.on('temp', (data) => {
        console.log(data.name + ' : ' + data.temperature)
      })

      this.stoker.on('data', (data) => {
        this.emit('data', data)
      })

      this.stoker.on('error', (e) => {
        // TODO add validation of passed host & port for the stoker to avoid ERR_INVALID_URL
        if (e.code === 'EHOSTUNREACH' || e.code === 'EHOSTDOWN' || e.code === 'ETIMEDOUT' || e.code === 'ECONNABORTED' || e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND' || e.code === 'ERR_INVALID_URL') {
          this.emit('stoker:not-found')
        } else {
          this.emit('stoker:error', {
            message: e && e.message ? e.message : String(e)
          })
        }
      })
    })
  }

  close () {
    if (this.stoker) this.stoker.close()
  }
}

module.exports = StokerServer
