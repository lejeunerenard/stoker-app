import test from 'tape'
import tmpDir from 'test-tmp'
import Hyperdb from 'hyperdb'
import { TimesSeries } from '../workers/timeseries.js'
import def from '../spec/hyperdb/index.js'

test('timeseries - create and lookup data', async (t) => {
  const db = Hyperdb.rocks(await tmpDir(), def)
  const ts = new TimesSeries(db)
  const now = new Date()
  const series = { measurement: 'foo', tags: ['bar'], field: 'biz' }
  await ts.addDatapoint(series, 123, now)
  await ts.getDatapoint(series, now)
})
