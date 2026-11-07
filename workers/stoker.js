const EventEmitter = require('events').EventEmitter
const querystring = require('querystring')
const http = require('http')

class Stoker extends EventEmitter {
  constructor (ip, pollPeriod = 5 * 1000) {
    super()
    this.ip = ip
    this.state = {}
    this.closed = false

    this.on('data', (data) => {
      if (data.stoker.sensors) {
        for (const sensor of data.stoker.sensors) {
          this.emit('temp', {
            name: sensor.name,
            temperature: sensor.tempCurrent
          })
        }
      }
    })

    this._pollInterval = null
    this.pollData(pollPeriod)
  }

  async getData () {
    const response = await new Promise((resolve, reject) => {
      http.request('http://' + this.ip + '/stoker.json?version=true',
        { responseType: 'json' })
        .setTimeout(5 * 1000)
        .on('response', (res) => {
          // TODO Handle real error HTTP status codes from stoker
          // Currently the error handling is mock-rocks-bbq-stokerii specific
          let json = ''
          res
            .on('data', (chunk) => {
              json += chunk.toString()
            })
            .on('end', () => {
              const data = JSON.parse(json)
              if (res.statusCode !== 200) {
                reject(data.error)
              } else {
                resolve(data)
              }
            })
        })
        .on('error', (e) => reject(e))
        .end()
    }).catch((e) => {
      this.emit('error', e)
    })
    if (!response) return

    this.state = response

    const data = Object.assign({}, response, { timestamp: (new Date()).toISOString() })
    if (data.stoker.sensors) {
      for (let i = 0; i < data.stoker.sensors.length; i++) {
        data.stoker.sensors[i].tempTarget = data.stoker.sensors[i].ta
        data.stoker.sensors[i].tempCurrent = data.stoker.sensors[i].tc
      }
    }
    this.emit('data', data)
  }

  pollData (period) {
    clearInterval(this._pollInterval)
    this._pollInterval = setInterval(this.getData.bind(this), period)
  }

  async setBlower (on, sensorIds = [], blowerId) {
    if (!('stoker' in this.state)) {
      await this.getData()
    }

    // Default to first blower
    if (!blowerId) {
      blowerId = this.state.stoker.blowers[0].id
    }

    const form = {}
    for (const sensorId of sensorIds) {
      form['sw' + sensorId] = on ? blowerId : 'None'
    }

    const url = 'http://' + this.ip + '/stoker.Post_Handler'
    const request = http.request(url + '?' + querystring.stringify(form), { method: 'POST' })
    request.on('error', (e) => {
      this.emit('error', e)
    })
  }

  close () {
    clearInterval(this._pollInterval)
    this.closed = true
  }
}
module.exports = Stoker
