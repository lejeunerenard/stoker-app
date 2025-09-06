import test from 'tape'
import tmp from 'test-tmp'
import { Store } from '../src/store/index.mjs'

test('store - basic', async (t) => {
  const store = new Store({
    path: await tmp(t)
  })
  await store.set('foo', 'biz')
  t.equals(await store.get('foo'), 'biz')
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
