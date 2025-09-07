/** @typedef {import('pear-interface')} */ /* global Pear */
const FramedStream = require('framed-stream')
const path = require('path')
const HRPC = require('../../../spec/hrpc/index.js')

function pearStore (state, emitter) {
  const link = Pear.key ? `${Pear.config.applink}/src/backend/index.mjs` : path.join(Pear.config.dir, 'src', 'backend', 'index.mjs')
  const worker = Pear.worker.run(link)
  const pipe = new FramedStream(worker)
  state.rpc = new HRPC(pipe)

  emitter.emit('rpc:ready', state.rpc)
}

module.exports = pearStore
