import test from 'tape'
import tmpDir from 'test-tmp'
import { Store } from '../workers/store/index.mjs'

// Reads go through `store.getSessionDatapoints`: the chart's datapoints come
// from the timeseries-db overlay, never from poll data
test('store - timeseries record and session read', async (t) => {
  const store = new Store({ path: await tmpDir(t) })

  const session = await store.createSession({ name: 'test session' })
  t.is(session.id.key.byteLength, 32, 'session key is fixed32')

  const sessionKeyHex = Array.from(session.id.key).map((b) => b.toString(16).padStart(2, '0')).join('')
  await store.set('currentSession', sessionKeyHex)

  const timestamp = new Date()
  const poll = {
    stoker: {
      sensors: [
        { id: '1', name: 'Brisket', tc: 165.5 },
        { id: '2', name: 'Butt', tc: 70.25 }
      ],
      blowers: [{ id: 'b1', name: 'Main Blower', on: true }]
    }
  }
  const recorded = await store.recordStoker(poll, timestamp)
  t.is(recorded.length, 3, 'records two sensors plus a blower')
  t.is(recorded[0].name, 'Brisket', 'sensor datapoint keeps sensor name as field')
  t.is(recorded[0].tempCurrent, 165.5, 'sensor temp passes through unscaled for display')

  const points = await store.getSessionDatapoints(session.id)
  t.is(points.length, 3, 'session query returns all three points')
  t.is(points[0].name, 'Brisket', 'points sorted by timestamp first written first')
  t.is(points[0].tempCurrent, 165.5, '×10 scaling round-trips on read')
  t.is(points[2].name, 'blower-b1', 'blower recorded as 0/1 series with same session tag')
  t.is(points[2].tempCurrent, 1, 'blower on encodes as int 1')

  // concurrent db mutations go through the write queue
  const queued = await Promise.all([
    store.set('currentSession', sessionKeyHex),
    store.recordStoker(
      { stoker: { sensors: [{ id: '1', name: 'Brisket', tc: 170 }], blowers: [] } },
      new Date(Number(timestamp) + 1000)
    ),
    store.recordStoker(
      { stoker: { sensors: [{ id: '1', name: 'Brisket', tc: 175 }], blowers: [] } },
      new Date(Number(timestamp) + 2000)
    )
  ])
  t.is(queued[0], true, 'config write committed alongside the polls')
  t.is(queued[1].length, 1, 'queued poll recorded one datapoint')
  t.is(queued[2].length, 1, 'queued poll recorded one datapoint')

  // idle poll (no current session) must not leak into the session query
  await store.set('currentSession', '')
  const idle = {
    stoker: { sensors: [{ id: '1', name: 'Brisket', tc: 200 }], blowers: [] }
  }
  await store.recordStoker(idle, new Date(Number(timestamp) + 5000))
  const sessionPoints = await store.getSessionDatapoints(session.id)
  t.is(sessionPoints.length, 5, 'idle poll datapoints excluded from the session query')

  // the `since` cursor is inclusive and query-bounded: everything at or after
  // it, still scoped to this session's tag (the renderer dedupes the overlap)
  const atCursor = await store.getSessionDatapoints(session.id, timestamp)
  t.is(atCursor.length, 5, 'inclusive cursor re-delivers the group at it plus everything newer')

  const sincePoints = await store.getSessionDatapoints(session.id, new Date(Number(timestamp) + 3000))
  t.is(sincePoints.length, 0, 'cursor past every point excludes them')

  const beforeGroup = await store.getSessionDatapoints(session.id, new Date(Number(timestamp) - 1000))
  t.is(beforeGroup.length, 5, 'cursor before the group returns all five, still session-tag scoped')

  await store.db.close()
})
