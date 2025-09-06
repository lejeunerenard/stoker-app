const test = require('tape')
const { EventEmitter } = require('events')
const { setTimeout } = require('timers/promises')
const StokerServer = require('../src/stoker-server')
const MockStoker = require('./helpers/mock-stoker')

const createWS = (port, bus) => {
  const ws = new WebSocket('ws://localhost:' + port)
  ws.onmessage = ({ data }) => {
    data = JSON.parse(data)
    bus.emit(data.event, data.data)
  }

  return ws
}

test('Stoker server', (t) => {
  t.test('constructor', (t) => {
    const ss = new StokerServer()
    t.ok(ss.app)
    t.end()
  })

  t.test('events', (t) => {
    t.test('setip', (t) => {
      const ip = '123.123.123.123'
      const ss = new StokerServer()
      ss.emit('stoker:setip', ip)
      t.equal(ss.stoker.ip, ip, 'ip is set')
      const firstStoker = ss.stoker

      const ip2 = '1.2.3.4'
      ss.emit('stoker:setip', ip2)
      t.equal(ss.stoker.ip, ip2, 'new ip is set')
      const secondStoker = ss.stoker
      t.notEqual(firstStoker, secondStoker, 'second ip event creates different stoker')
      t.ok(firstStoker.closed, 'first stoker was closed automatically')

      firstStoker.close()
      secondStoker.close()
      t.end()
    })
  })

  t.test('websocket', (t) => {
    t.test('event : stoker:not-found', async (t) => {
      t.plan(1)
      const ip = '123.123.123.123'
      const PORT = 1337
      const ss = new StokerServer()
      ss.emit('stoker:setip', ip)

      ss.emit('stoker:setwsport', PORT)

      const bus = new EventEmitter()
      bus.on('stoker:not-found', () => {
        t.pass('Got not found error')
      })
      createWS(PORT, bus)

      // Allow not found to trigger
      await setTimeout(2.01 * ss.pollPeriod)

      ss.close()
      t.end()
    })

    t.test('event : data', async (t) => {
      t.plan(1)
      const PORT = 1338
      const ss = new StokerServer()
      ss.pollPeriod = 200

      const mStoker = new MockStoker()
      const server = await new Promise((resolve) => {
        const server = mStoker.listen(7331, () => resolve(server))
      })

      ss.emit('stoker:setwsport', PORT)

      const bus = new EventEmitter()
      bus.on('data', () => {
        t.pass('Got data')
      })
      createWS(PORT, bus)

      await setTimeout(100)
      ss.emit('stoker:setip', 'localhost:7331')

      // Allow not found to trigger
      await setTimeout(1.1 * ss.pollPeriod)

      ss.close()
      server.close()
      t.end()
    })
  })
})
