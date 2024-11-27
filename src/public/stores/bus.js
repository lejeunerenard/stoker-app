const axios = require('axios').default
const { PORT } = require('../../variables.json')

function busStore (state, emitter) {
  function setupWS (port, bus) {
    const ws = new WebSocket('ws://' + (window.location.hostname ? window.location.hostname : 'localhost') + ':' + port)
    ws.onopen = () => {
      console.log('ws connected')
      bus.on('store:get', (field) => {
        ws.send(JSON.stringify({ event: 'store:get', data: field }))
      })
      bus.on('store:set', (field, value) => {
        ws.send(JSON.stringify({ event: 'store:set', data: [field, value] }))
      })

      // Now connection is open, get info
      bus.emit('store:get', 'stokerIP')
    }

    ws.onmessage = ({ data }) => {
      data = JSON.parse(data)
      bus.emit(data.event, data.data)
    }
  }

  function getWSPort () {
    axios.get(`http://${window.location.hostname ? window.location.hostname : 'localhost'}:${PORT}/ws-port`)
      .then((response) => {
        const port = response.data
        setupWS(port, emitter)
      })
  }

  getWSPort()
}

module.exports = busStore
