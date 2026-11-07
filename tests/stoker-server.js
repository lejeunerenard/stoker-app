const test = require('tape')
const StokerServer = require('../workers/stoker-server')

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
})
