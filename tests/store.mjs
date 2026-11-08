import test from 'tape'
import tmp from 'test-tmp'
import { Store } from '../workers/store/index.mjs'

test('store - basic', async (t) => {
  const store = new Store({
    path: await tmp(t)
  })
  await store.set('foo', 'biz')
  t.equals(await store.get('foo'), 'biz')
  t.end()
})

test('store - set returns bool if successful', async (t) => {
  const store = new Store({
    path: await tmp(t)
  })
  t.ok(await store.set('foo', 'biz'), 'returns bool')
  t.end()
})

test('store - onDidChange', async (t) => {
  t.plan(3)
  const store = new Store({
    path: await tmp(t)
  })
  await store.set('foo', 'biz')
  t.equals(await store.get('foo'), 'biz')

  store.onDidChange('foo', (current, previous) => {
    t.equals(current, 'baz')
    t.equals(previous, 'biz')
  })
  await store.set('foo', 'baz')
})

test('store - sessions', async (t) => {
  t.plan(9)
  const store = new Store({
    path: await tmp(t)
  })

  const session = await store.createSession({ name: 'test session' })
  t.equals(session.name, 'test session', 'created session has name')
  t.equals(session.id.key.byteLength, 32, 'session key is a fixed32')

  const now = new Date()
  const createdOn = Number(session.id.createdOn)
  t.ok(createdOn <= Number(now) && createdOn >= Number(now) - 1000, 'createdOn defaults to now')

  const sessions = await store.getSessions()
  t.equals(sessions.length, 1, 'session loads back from the collection')

  const updated = await store.updateSession(session.id, 'renamed')
  t.equals(updated.name, 'renamed', 'updateSession saves the new name')

  const updatedSessions = await store.getSessions()
  t.equals(updatedSessions.length, 1, 'updateSession does not duplicate the session')
  t.equals(updatedSessions[0].name, 'renamed', 'session in the collection is updated')

  t.ok(await store.deleteSession(session.id), 'deleteSession returns true')

  t.equals((await store.getSessions()).length, 0, 'deleteSession removes the session')
})
