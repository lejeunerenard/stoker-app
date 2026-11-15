// Mirror of the upstream timeseries-db `build.js` schema registrations
// (github.com/lejeunerenard/timeseries-db). The namespace must stay
// 'timeseries-db': the library's `Timeseries` wrapper resolves
// `@timeseries-db/series-data`, `@timeseries-db/series-ids` and
// `@timeseries-db/series-id-latest` on the booted hyperdb definition.
export const NS = 'timeseries-db'

export function generateSchema (schema) {
  const ts = schema.namespace(NS)

  ts.register({
    name: 'tag',
    fields: [
      {
        name: 'key',
        type: 'string',
        required: true
      },
      {
        name: 'value',
        type: 'string',
        required: true
      }
    ]
  })

  const SeriesIdFields = [
    {
      name: 'measurement',
      type: 'string',
      required: true
    },
    {
      // an encoding of the 'tag' struct as an ordered array at library runtime
      name: 'tags',
      type: 'buffer',
      required: true
    },
    {
      name: 'field',
      type: 'string',
      required: true
    }
  ]

  ts.register({
    name: 'series-id',
    alias: 'uint'
  })

  ts.register({
    name: 'series-normalized-key-inverted-lookup',
    fields: [
      ...SeriesIdFields,
      {
        name: 'series-id',
        type: `@${NS}/series-id`,
        required: true
      }
    ]
  })

  ts.register({
    name: 'series-datapoint',
    fields: [
      {
        name: 'series-id',
        type: `@${NS}/series-id`,
        required: true
      },
      {
        name: 'timestamp',
        type: 'date',
        required: true
      },
      {
        name: 'value',
        type: 'int', // Only numbers atm
        required: true
      }
    ]
  })

  // High mark of the series-id counter: one committed row per counter
  // partition, the only one used in v1 is { name: 'latest' }. A `name`
  // field so the collection key is never empty, which keeps the generated
  // keyEncoding a real IndexEncoder. Room for per-namespace/per-measurement
  // counters later.
  ts.register({
    name: 'series-id-latest',
    fields: [
      {
        name: 'name',
        type: 'string',
        required: true
      },
      {
        name: 'id',
        type: `@${NS}/series-id`,
        required: true
      }
    ]
  })
}
