import Hyperschema from 'hyperschema'
import Hyperdb from 'hyperdb/builder'

const SCHEMA_DIR = './spec/hyperschema'
const DB_DIR = './spec/hyperdb'

const NS = 'stoker-app'

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

Hyperschema.toDisk(schema, { esm: true })

const db = Hyperdb.from(SCHEMA_DIR, DB_DIR)
const stokerDb = db.namespace(NS)

stokerDb.collections.register({
  name: 'config',
  schema: `@${NS}/config`,
  key: ['key']
})

Hyperdb.toDisk(db)
