const test = require('tape')
const { mkdtemp, access, rm } = require('fs/promises')
const { join } = require('path')
const { tmpdir } = require('os')
const { createSession, saveSession } = require('../src/sessions')

test('createSession', (t) => {
  t.test('default name', (t) => {
    const session = createSession()
    const now = new Date()
    const name = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate()
    t.ok(Math.abs(session.createdTimestamp.getTime() - now.getTime()) < 10, 'createdTimestamp is now(ish)')
    // Remove to make testing the rest simpler
    delete session.createdTimestamp

    t.deepEquals(session, {
      name,
      filename: `${name}.json`,
      data: []
    })
    t.end()
  })

  t.test('custom name', (t) => {
    const session = createSession('foo')
    const now = new Date()
    t.ok(Math.abs(session.createdTimestamp.getTime() - now.getTime()) < 10, 'createdTimestamp is now(ish)')
    // Remove to make testing the rest simpler
    delete session.createdTimestamp

    t.deepEquals(session, {
      name: 'foo',
      filename: 'foo.json',
      data: []
    })
    t.end()
  })
})

test('saveSession', async (t) => {
  const sessionDir = await mkdtemp(join(tmpdir(), 'sessions'))
  t.teardown(async () => {
    await rm(sessionDir, { recursive: true })
  })

  const session = createSession()
  saveSession(session, sessionDir)

  const filepath = join(sessionDir, `${session.name}.json`)
  try {
    await access(filepath)
    t.ok('file created')
  } catch {
    t.fail('session file not created')
  }

  t.end()
})
