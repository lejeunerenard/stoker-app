const test = require('tape')
const Stoker = require('../workers/stoker')
const MockStoker = require('./helpers/mock-stoker')
const { setTimeout } = require('timers/promises')

test('Stoker', (t) => {
  t.test('constructor', (t) => {
    const s = new Stoker('127.0.0.1')
    t.equal(s.ip, '127.0.0.1', 'accepts ip in constructor')
    s.close()
    t.end()
  })

  t.test('data', async (t) => {
    const PORT = 3337
    const mStoker = new MockStoker()
    const server = mStoker.listen(PORT, () => {
      t.pass('mock stoker is setup')
    })
    const s = new Stoker(`127.0.0.1:${PORT}`, 1000)
    s.on('error', (e) => {
      console.log('e', e)
    })
    s.on('data', (data) => {
      t.deepEquals({ stoker: data.stoker }, { stoker: { sensors: [] } })
    })
    await setTimeout(1.5 * 1000)

    s.close()
    server.close()
    t.end()
  })
})
