import test from 'tape'
import tmpDir from 'test-tmp'
import Hyperdb from 'hyperdb'
import Timeseries from 'timeseries-db'
import def from '../spec/hyperdb/index.js'

// Timeseries is the real github.com/lejeunerenard/timeseries-db wrapper over
// a booted hyperdb carrying the generated definition (the app's spec/hyperdb
// must contain the @timeseries-db/* collections for the wrapper to boot)
test('timeseries-db - insert flush read', async (t) => {
  const db = Hyperdb.rocks(await tmpDir(t), def)
  const ts = new Timeseries(db)
  const now = new Date()
  const tags = [{ key: 'session', value: 'aabbcc' }]

  await ts.insert('stoker', tags, 'Brisket', now, 1652)
  await ts.insert('stoker', tags, 'Brisket', new Date(Number(now) + 5000), 1657)
  await ts.insert('stoker', tags, 'Butt', now, 701)
  await ts.flush()

  t.is(ts.writable, true, 'wrapper reports writable')

  const exact = await ts.get('stoker', tags, 'Brisket', now)
  t.is(exact.value, 1652, 'get returns exact datapoint')

  const stream = await ts.find({
    gte: { measurement: 'stoker', tags, field: 'Brisket' },
    lte: { measurement: 'stoker', tags, field: 'Brisket' }
  })
  const pts = await stream.toArray()
  t.is(pts.length, 2, 'find returns the two Brisket datapoints')
  t.is(pts[0].value, 1652, 'find first point matches write order')

  const seriesRows = await ts.findSeries({ gte: { measurement: 'stoker', tags } })
  t.is(seriesRows.length, 2, 'findSeries prefix scan finds both session series')
  t.is(seriesRows[0].tags.length, 1, 'series row tags denormalized to pairs')
  t.is(seriesRows[0].tags[0].key, 'session', 'series row tag key round-trips')
  t.is(seriesRows[0].tags[0].value, 'aabbcc', 'series row tag value round-trips')

  const counter = await db.get('@timeseries-db/series-id-latest', { name: 'latest' })
  t.is(counter.id, 2, 'series-id counter committed by the flush')

  // untagged idle series (no session recorded yet) stays separate from the
  // session-tagged series
  await ts.insert('stoker', [], 'Brisket', now, 1650)
  await ts.flush()
  const idleQuery = { measurement: 'stoker', tags: [] }
  const idleRows = await ts.findSeries({ gte: idleQuery, lte: idleQuery })
  t.is(idleRows.length, 1, 'untagged query matches only untagged series')
  const taggedQuery = { measurement: 'stoker', tags }
  const taggedRows = await ts.findSeries({ gte: taggedQuery, lte: taggedQuery })
  t.is(taggedRows.length, 2, 'session-tagged query excludes untagged series')

  await db.close()
})
