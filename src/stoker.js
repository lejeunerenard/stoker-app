const EventEmitter = require('events').EventEmitter
const querystring = require('querystring')
const axios = require('axios').default

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

  getData () {
    return axios.get('http://' + this.ip + '/stoker.json?version=true', {
      responseType: 'json',
      timeout: 5 * 1000
    })
      .then((response) => {
        this.state = response.data

        const data = Object.assign({}, response.data, { timestamp: (new Date()).toISOString() })
        if (data.stoker.sensors) {
          for (let i = 0; i < data.stoker.sensors.length; i++) {
            data.stoker.sensors[i].tempTarget = data.stoker.sensors[i].ta
            data.stoker.sensors[i].tempCurrent = data.stoker.sensors[i].tc
          }
        }
        this.emit('data', data)
      }).catch((e) => {
        this.emit('error', e)
      })
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

    return axios.post(
      'http://' + this.ip + '/stoker.Post_Handler',
      querystring.stringify(form)
    ).catch((e) => {
      this.emit('error', e)
    })
  }

  close () {
    clearInterval(this._pollInterval)
    this.closed = true
  }
}
module.exports = Stoker
