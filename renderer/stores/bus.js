export function busStore (state, emitter) {
  function rpcReady (rpc, bus) {
    bus.on('store:get', async (key) => {
      const { value: res } = await rpc.storeGet({ key })
      bus.emit('store:get:' + key, res)
    })
    bus.on('store:set', async (key, value) => {
      await rpc.storeSet({ key, value })
    })

    // Now connection is open, get info
  }

  emitter.once('rpc:ready', (rpc) => {
    rpcReady(rpc, emitter)
    // kick off after listeners are registered, otherwise the first emit has
    // nobody subscribed yet
    emitter.emit('store:get', 'stokerIP')
  })

  // function setupWS (port, bus) {
  //   const ws = new WebSocket('ws://' + (window.location.hostname ? window.location.hostname : 'localhost') + ':' + port)
  //   ws.onopen = () => {
  //     console.log('ws connected')
  //     bus.on('store:get', (field) => {
  //       ws.send(JSON.stringify({ event: 'store:get', data: field }))
  //     })
  //     bus.on('store:set', (field, value) => {
  //       ws.send(JSON.stringify({ event: 'store:set', data: [field, value] }))
  //     })

  //     // Now connection is open, get info
  //     bus.emit('store:get', 'stokerIP')
  //   }

  //   ws.onmessage = ({ data }) => {
  //     data = JSON.parse(data)
  //     bus.emit(data.event, data.data)
  //   }
  // }

  // function getWSPort () {
  //   axios.get(`http://${window.location.hostname ? window.location.hostname : 'localhost'}:${PORT}/ws-port`)
  //     .then((response) => {
  //       const port = response.data
  //       setupWS(port, emitter)
  //     })
  // }

  // getWSPort()
}
