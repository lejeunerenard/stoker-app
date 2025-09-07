import Hyperschema from 'hyperschema'
import Hyperdb from 'hyperdb/builder'
import HRPCBuilder from 'hrpc'

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

Hyperschema.toDisk(schema, { esm: true })

// HyperDB
const db = Hyperdb.from(SCHEMA_DIR, DB_DIR)
const stokerDb = db.namespace(NS)

stokerDb.collections.register({
  name: 'config',
  schema: `@${NS}/config`,
  key: ['key']
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

HRPCBuilder.toDisk(rpcBuilder, { esm: false })
