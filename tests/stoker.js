const test = require('tape')
const Stoker = require('../src/stoker')

test('Stoker', (t) => {
  t.test('constructor', (t) => {
    console.log('Stoker', Stoker)
    const s = new Stoker('127.0.0.1')
    t.equal(s.ip, '127.0.0.1', 'accepts ip in constructor')
    s.close()
    t.end()
  })
})
