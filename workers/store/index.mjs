import Hyperdb from 'hyperdb'
import CorestoreStorage from 'hypercore-storage'
import assert from 'assert'
import def from '../../spec/hyperdb/index.js'

const NS = 'stoker-app'

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

    await this.db.insert(`@${NS}/session`, session)
    await this.db.flush()

    return session
  }

  getSessions () {
    // TODO Consider if the use case elsewhere needs the query cursor instead of the result array.
    // Also might want to stream instead of do it all at once.
    // The query stream fully drains (and self-closes) on toArray
    return this.db.find(`@${NS}/session`).toArray()
  }

  async updateSession (sessionId, name) {
    const existing = await this.db.get(`@${NS}/session`, { id: sessionId })
    if (!existing) throw new Error('[Store] no session found for sessionId')

    // Re-inserting the same `id.key` updates the existing entry
    await this.db.insert(`@${NS}/session`, { id: existing.id, name })
    await this.db.flush()

    return { id: existing.id, name }
  }

  async deleteSession (sessionId) {
    await this.db.delete(`@${NS}/session`, { id: sessionId })
    await this.db.flush()

    return true
  }

  async set (key, value) {
    const existing = await this.get(key)
    await this.db.insert(`@${NS}/config`, { key, value })
    await this.db.flush()
    if (key in this.watchers) {
      for (const fn of this.watchers[key]) {
        fn(value, existing)
      }
    }

    return true
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
