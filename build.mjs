import Hyperschema from 'hyperschema'
import Hyperdb from 'hyperdb/builder'
import HRPCBuilder from 'hrpc'
import { generateSchema, NS as STOKERII_NS } from './builder/rocks-bbq-stokerii/index.mjs'
import { generateSchema as generateTimeseriesSchema, NS as TIMESERIESDB_NS } from './builder/timeseries-db/index.mjs'

const SCHEMA_DIR = './spec/hyperschema'
const DB_DIR = './spec/hyperdb'
const HRPC_DIR = './spec/hrpc'

const NS = 'stoker-app'

// Hyperschema
const schema = Hyperschema.from(SCHEMA_DIR)
const stoker = schema.namespace(NS)

stoker.register({
  name: 'config',
  compact: true,
  fields: [
    {
      name: 'key',
      type: 'string',
      required: true
    },
    {
      name: 'value',
      type: 'json',
      required: true
    }
  ]
})

stoker.register({
  name: 'config-get-request',
  compact: true,
  fields: [
    {
      name: 'key',
      type: 'string',
      required: true
    }
  ]
})

stoker.register({
  name: 'config-get-response',
  compact: true,
  fields: [
    {
      name: 'value',
      type: 'json'
    }
  ]
})

stoker.register({
  name: 'config-set-request',
  compact: true,
  fields: [
    {
      name: 'key',
      type: 'string',
      required: true
    },
    {
      name: 'value',
      type: 'json',
      required: true
    }
  ]
})

stoker.register({
  name: 'config-set-response',
  compact: true,
  fields: [
    {
      name: 'success',
      type: 'bool',
      required: true
    }
  ]
})

generateSchema(schema)

// timeseries-db overlay types: registered here so they land in the single
// `Hyperschema.toDisk(schema)` pass below
generateTimeseriesSchema(schema)

stoker.register({
  name: 'session-id',
  fields: [
    {
      name: 'createdOn',
      type: 'date',
      required: true
    },
    {
      name: 'key',
      type: 'fixed32',
      required: true
    }
  ]
})

stoker.register({
  name: 'session',
  fields: [
    {
      name: 'id',
      type: `@${NS}/session-id`,
      required: true
    },
    {
      name: 'name',
      type: 'string',
      required: true
    }
  ]
})

stoker.register({
  name: 'stoker-datapoint',
  compact: false,
  fields: [
    {
      name: 'stoker',
      type: `@${STOKERII_NS}/stoker`,
      required: true
    },
    {
      name: 'timestamp',
      type: 'date',
      required: true
    }
  ]
})

stoker.register({
  name: 'sensor-data',
  compact: false,
  fields: [
    {
      name: 'name',
      type: 'string',
      required: true
    },
    {
      name: 'tempCurrent',
      type: 'float32',
      required: true
    },
    {
      name: 'timestamp',
      type: 'date',
      required: true
    }
  ]
})

stoker.register({
  name: 'session-data-request',
  compact: false,
  fields: [
    {
      name: 'sessionId',
      type: `@${NS}/session-id`,
      required: true
    },
    {
      // live-chart cursor: datapoints strictly after this timestamp; the
      // renderer chains one finite stream per request (hrpc v4 streams
      // always end, open-ended follow streams are not supported)
      name: 'since',
      type: 'date'
    }
  ]
})

stoker.register({
  name: 'session-data-response',
  compact: false,
  fields: [
    {
      name: 'sensors',
      type: `@${NS}/sensor-data`,
      array: true,
      required: true
    }
  ]
})

stoker.register({
  name: 'get-sessions-request',
  compact: false,
  fields: []
})

stoker.register({
  name: 'get-sessions-response',
  compact: false,
  fields: [
    {
      name: 'sessions',
      type: `@${NS}/session`,
      array: true,
      required: true
    }
  ]
})

stoker.register({
  name: 'session-create-request',
  compact: false,
  fields: [
    {
      name: 'name',
      type: 'string',
      required: true
    }
  ]
})

stoker.register({
  name: 'session-delete-request',
  compact: false,
  fields: [
    {
      name: 'sessionId',
      type: `@${NS}/session-id`,
      required: true
    }
  ]
})

stoker.register({
  name: 'session-delete-response',
  compact: true,
  fields: [
    {
      name: 'success',
      type: 'bool',
      required: true
    }
  ]
})

stoker.register({
  name: 'session-edit-request',
  compact: false,
  fields: [
    {
      name: 'sessionId',
      type: `@${NS}/session-id`,
      required: true
    },
    {
      name: 'name',
      type: 'string',
      required: true
    }
  ]
})

stoker.register({
  name: 'worker-event-request',
  compact: true,
  fields: [
    {
      name: 'name',
      type: 'string',
      required: true
    }
  ]
})

stoker.register({
  name: 'apply-update-request',
  compact: true,
  fields: []
})

stoker.register({
  name: 'apply-update-response',
  compact: true,
  fields: [
    {
      name: 'ok',
      type: 'bool',
      required: true
    },
    {
      name: 'error',
      type: 'string'
    }
  ]
})

Hyperschema.toDisk(schema, { esm: false })

// HyperDB
const db = Hyperdb.from(SCHEMA_DIR, DB_DIR)
const stokerDb = db.namespace(NS)

stokerDb.collections.register({
  name: 'config',
  schema: `@${NS}/config`,
  key: ['key']
})

// `id.key` is a random 32 byte key per session, the created date lives in
// `id.createdOn` and is set automatically when the session is created
stokerDb.collections.register({
  name: 'session',
  schema: `@${NS}/session`,
  key: ['id.key']
})

// timeseries-db overlay (mirror of the upstream library's build.js hyperdb
// registrations, verified against its repo source). Registered AFTER
// config/session so existing collection ids 0/1 stay stable — a renumbered
// definition would orphan existing stored data. The namespace must stay
// 'timeseries-db': the Timeseries wrapper resolves those exact names.
const tsDb = db.namespace(TIMESERIESDB_NS)

// emitted into the generated spec/hyperdb/index.js as
// `require('../../builder/inverted-indexes.js')` → the vendored copy in the
// app's builder/, whose `../spec/hyperschema/index.js` require then picks up
// the regenerated app schema's `@timeseries-db/tag` encoding
tsDb.require('builder/inverted-indexes.js')

tsDb.collections.register({
  name: 'series-ids',
  schema: `@${TIMESERIESDB_NS}/series-normalized-key-inverted-lookup`,
  key: ['measurement', 'tags', 'field']
})

// derived indexes for by-tag/by-field discovery of series (the Timeseries
// wrapper v1 never probes them, kept for parity with the lib's db.json)
tsDb.indexes.register({
  name: 'series-by-tag',
  collection: `@${TIMESERIESDB_NS}/series-ids`,
  key: {
    type: {
      fields: [
        { name: 'key', type: 'string' },
        { name: 'value', type: 'string' }
      ]
    },
    map: 'tagIndex'
  }
})

tsDb.indexes.register({
  name: 'series-by-field',
  collection: `@${TIMESERIESDB_NS}/series-ids`,
  key: {
    type: 'string',
    map: 'fieldIndex'
  }
})

tsDb.collections.register({
  name: 'series-data',
  schema: `@timeseries-db/series-datapoint`,
  key: ['series-id', 'timestamp']
})

tsDb.collections.register({
  name: 'series-id-latest',
  schema: `@timeseries-db/series-id-latest`,
  key: ['name']
})

Hyperdb.toDisk(db, { esm: false })

// HRPC
const rpcBuilder = HRPCBuilder.from(SCHEMA_DIR, HRPC_DIR)
const rpc = rpcBuilder.namespace(NS)

rpc.register({
  name: 'store-get',
  request: { name: `@${NS}/config-get-request` },
  response: { name: `@${NS}/config-get-response` }
})

rpc.register({
  name: 'store-set',
  request: { name: `@${NS}/config-set-request` },
  response: { name: `@${NS}/config-set-response` }
})

rpc.register({
  name: 'get-sessions',
  request: {
    name: `@${NS}/get-sessions-request`,
  },
  response: {
    name: `@${NS}/get-sessions-response`
  }
})

rpc.register({
  name: 'session-data',
  request: {
    name: `@${NS}/session-data-request`,
    stream: false
  },
  response: {
    name: `@${NS}/session-data-response`,
    stream: true
  }
})

rpc.register({
  name: 'create-session',
  request: { name: `@${NS}/session-create-request` },
  response: { name: `@${NS}/session` }
})

rpc.register({
  name: 'delete-session',
  request: { name: `@${NS}/session-delete-request` },
  response: { name: `@${NS}/session-delete-response` }
})

rpc.register({
  name: 'edit-session',
  request: { name: `@${NS}/session-edit-request` },
  response: { name: `@${NS}/session` }
})

rpc.register({
  name: 'worker-event',
  request: {
    name: `@${NS}/worker-event-request`,
    send: true
  }
})

rpc.register({
  name: 'apply-update',
  request: {
    name: `@${NS}/apply-update-request`
  },
  response: {
    name: `@${NS}/apply-update-response`
  }
})

HRPCBuilder.toDisk(rpcBuilder, { esm: false })
