export function busStore (_, emitter) {
  emitter.once('rpc:ready', (rpc) => {
    emitter.on('store:get', async (key) => {
      const { value: res } = await rpc.storeGet({ key })
      emitter.emit('store:get:' + key, res)
    })
    emitter.on('store:set', async (key, value) => {
      await rpc.storeSet({ key, value })
    })
    // kick off after listeners are registered, otherwise the first emit has
    // nobody subscribed yet
    emitter.emit('store:get', 'stokerIP')
  })
}
