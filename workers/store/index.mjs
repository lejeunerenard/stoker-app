import Hyperdb from 'hyperdb'
import CorestoreStorage from 'hypercore-storage'
import assert from 'assert'
import def from '../../spec/hyperdb/index.js'
import Timeseries from 'timeseries-db'

const NS = 'stoker-app'

// Datapoint series convention for the stoker view: measurement 'stoker' is
// the total view, the active session is a tag, the sensor (or blower) name
// is the field. Timeseries-db values are int-only, so temps are scaled ×10
// (tenths of a degree) on write and divided back on read.
const MEASUREMENT = 'stoker'
const SESSION_TAG_KEY = 'session'

// hex form of a session key's bytes — the renderer stores it as the
// `currentSession` config value, the worker derives it from a request
export function toHex (bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// queue links swallow errors so a failed write cannot poison later links
function noop () {}

// TODO make this cryptographically random
// Random 32 byte key for the `@stoker-app/session` collection (`fixed32`)
function randomKey () {
  const key = Buffer.alloc(32)

  for (let i = 0; i < 32; i++) {
    key[i] = Math.floor(Math.random() * 256)
  }

  return key
}

export class Store {
  constructor (options = {}) {
    this.path = options.path
    this.storage = options.storage
    assert(this.path || this.storage, '[Store] path or storage is required')

    if (!this.storage) {
      this.storage = new CorestoreStorage(this.path)
    }
    this.db = Hyperdb.rocks(this.storage.rocks.columnFamily(`${NS}/local-store`), def)
    this.watchers = {}

    // hyperdb commits one insert/delete batch at a time, so db mutations run
    // through this chain: one writer at a time, call order preserved
    this.dbQueue = Promise.resolve(null)

    // timeseries-db overlay over the same hyperdb; needs the
    // @timeseries-db/{series-data,series-ids,series-id-latest} collections
    // registered in build.mjs. One instance for the process: it holds the
    // series-id counter and per-batch series cache
    this.ts = new Timeseries(this.db)
  }

  // Chain a db mutation onto the write queue; returns the mutation's promise
  async dbWrite (fn) {
    const run = this.dbQueue.then(fn)
    this.dbQueue = run.then(noop, noop)
    return run
  }

  // Session tag for datapoints: the config `currentSession` value is the
  // active session key's hex (set by the renderer via store:set on session:set)
  async sessionTags () {
    const sessionKey = await this.get('currentSession')
    if (!sessionKey) return []
    return [{ key: SESSION_TAG_KEY, value: sessionKey }]
  }

  // Record one stoker poll: a series per sensor (field = sensor name) and one
  // per blower (0/1 flag, pre-scaled ×10 like temps so ÷10 on read is 1/0),
  // committed in a single flush. Runs on the write queue, and the active
  // session is read inside the closure: the tag is whatever session is current
  // when this batch commits
  async recordStoker (data, timestamp = new Date()) {
    const recorded = []

    return this.dbWrite(async () => {
      const tags = await this.sessionTags()

      for (const sensor of data.stoker.sensors || []) {
        await this.ts.insert(MEASUREMENT, tags, sensor.name, timestamp, Math.round(sensor.tc * 10))
        recorded.push({ name: sensor.name, tempCurrent: sensor.tc, timestamp })
      }
      for (const blower of data.stoker.blowers || []) {
        await this.ts.insert(MEASUREMENT, tags, 'blower-' + blower.id, timestamp, blower.on ? 10 : 0)
        recorded.push({ name: 'blower-' + blower.id, tempCurrent: blower.on ? 1 : 0, timestamp })
      }

      await this.ts.flush()
      return recorded
    })
  }

  // All datapoints for a session: a series-ids prefix scan by (measurement,
  // session tag), then one range scan per field on series-data. `since` is an
  // inclusive lower bound in the query (the identity-only `lte` bound is open
  // above), so a fetch is everything at or after it — inclusive because one
  // poll timestamp carries several fields, which is what keeps a partly
  // delivered fetch from losing points (the renderer dedupes on name +
  // timestamp). Bounded scans keep per-poll cost flat
  async getSessionDatapoints (sessionId, since = null) {
    const tags = [{ key: SESSION_TAG_KEY, value: toHex(sessionId.key) }]

    // matching gte+lte identity: a gte-only bound is an open range scan and
    // would include other sessions' series
    const bound = { measurement: MEASUREMENT, tags }
    const series = await this.ts.findSeries({ gte: bound, lte: bound })
    let points = []
    for (const row of series) {
      const identity = { measurement: MEASUREMENT, tags: row.tags, field: row.field }
      const search = since
        ? { gte: { ...identity, timestamp: since }, lte: identity }
        : { gte: identity, lte: identity }
      const stream = await this.ts.find(search)
      for (const point of await stream.toArray()) {
        points.push({ name: row.field, tempCurrent: point.value / 10, timestamp: point.timestamp })
      }
    }

    points.sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
    return points
  }

  // `createdOn` defaults to now, `key` is generated automatically
  async createSession (fields) {
    assert(fields.name, '[Store] session name is required')

    const session = {
      id: {
        createdOn: new Date(),
        key: randomKey()
      },
      name: fields.name
    }

    return this.dbWrite(async () => {
      await this.db.insert(`@${NS}/session`, session)
      await this.db.flush()

      return session
    })
  }

  getSessions () {
    // TODO Consider if the use case elsewhere needs the query cursor instead of the result array.
    // Also might want to stream instead of do it all at once.
    // The query stream fully drains (and self-closes) on toArray
    return this.db.find(`@${NS}/session`).toArray()
  }

  async updateSession (sessionId, name) {
    // not queued: callers await these one at a time
    const existing = await this.db.get(`@${NS}/session`, { id: sessionId })
    if (!existing) throw new Error('[Store] no session found for sessionId')

    return this.dbWrite(async () => {
      // Re-inserting the same `id.key` updates the existing entry
      await this.db.insert(`@${NS}/session`, { id: existing.id, name })
      await this.db.flush()

      return { id: existing.id, name }
    })
  }

  async deleteSession (sessionId) {
    return this.dbWrite(async () => {
      await this.db.delete(`@${NS}/session`, { id: sessionId })
      await this.db.flush()

      return true
    })
  }

  async set (key, value) {
    let existing = null

    const committed = this.dbWrite(async () => {
      // queued with the write so `existing` is the pre-commit value
      existing = await this.get(key)
      await this.db.insert(`@${NS}/config`, { key, value })
      await this.db.flush()

      return true
    })

    // watchers run after the commit and outside the queue link (a watcher
    // that wrote to the store would deadlock behind its own link); a throwing
    // watcher must not reject `set`
    return committed.then(() => {
      if (key in this.watchers) {
        for (const fn of this.watchers[key]) {
          try {
            fn(value, existing)
          } catch (err) {
            console.log('config watcher error', err)
          }
        }
      }

      return true
    })
  }

  async get (key) {
    const entry = await this.db.get(`@${NS}/config`, { key })
    if (entry) return entry.value

    return null
  }

  onDidChange (key, cb) {
    this.watchers[key] = this.watchers[key] || []
    this.watchers[key].push(cb)
  }
}
