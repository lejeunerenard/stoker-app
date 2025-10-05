/** @typedef {import('pear-interface')} */ /* global Pear */
import HRPC from '../../../spec/hrpc/index.js'
import FramedStream from 'framed-stream'
import path from 'path'

export function pearStore (state, emitter) {
  const link = Pear.key ? `${Pear.config.applink}/src/backend/index.mjs` : path.join(Pear.config.dir, 'src', 'backend', 'index.mjs')
  const worker = Pear.worker.run(link)
  const pipe = new FramedStream(worker)
  state.rpc = new HRPC(pipe)

  emitter.emit('rpc:ready', state.rpc)
}
