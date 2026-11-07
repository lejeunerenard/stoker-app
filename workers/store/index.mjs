import Hyperdb from 'hyperdb'
import CorestoreStorage from 'hypercore-storage'
import assert from 'assert'
import def from '../../spec/hyperdb/index.js'

const NS = 'stoker-app'

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
