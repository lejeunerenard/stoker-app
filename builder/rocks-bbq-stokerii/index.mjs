export const NS = 'rocks-bbq-stokerii'
export function generateSchema (schema) {
  const stoker = schema.namespace(NS)

  // Primitives
  stoker.register({
    name: 'sensor-id',
    alias: 'string'
  })

  stoker.register({
    name: 'blower-id',
    alias: 'string'
  })

  stoker.register({
    name: 'stoker-version',
    alias: 'string'
  })

  // Stoker Data
  stoker.register({
    name: 'sensor',
    compact: false,
    fields: [
      {
        name: 'id',
        type: `@${NS}/sensor-id`,
        required: true
      },
      {
        name: 'name',
        type: 'string',
        required: true
      },
      {
        name: 'al',
        type: 'uint8', // TODO Determine actual precision
        required: true
      },
      {
        name: 'ta', // target temp
        type: 'float32', // TODO Determine actual precision
        required: true
      },
      {
        name: 'th', // temp high?
        type: 'float32', // TODO Determine actual precision
        required: true
      },
      {
        name: 'tl', // temp low?
        type: 'float32', // TODO Determine actual precision
        required: true
      },
      {
        name: 'tc', // temp current
        type: 'float32',
        required: true
      },
      {
        name: 'blower',
        type: `@${NS}/blower-id`,
        required: false
      }
    ]
  })

  stoker.register({
    name: 'blower',
    compact: false,
    fields: [
      {
        name: 'id',
        type: `@${NS}/blower-id`,
        required: true
      },
      {
        name: 'name',
        type: 'string',
        required: true
      },
      {
        name: 'on',
        type: 'bool',
        required: true
      }
    ]
  })

  stoker.register({
    name: 'stoker',
    compact: false,
    fields: [
      {
        name: 'sensors',
        type: `@${NS}/sensor`,
        array: true,
        required: true
      },
      {
        name: 'blowers',
        type: `@${NS}/blower`,
        array: true,
        required: true
      },
      {
        name: 'version',
        type: `@${NS}/stoker-version`,
        required: false
      }
    ]
  })

  stoker.register({
    name: 'stoker-datapoint',
    compact: false,
    fields: [
      {
        name: 'stoker',
        type: `@${NS}/stoker`,
        required: true
      }
    ]
  })
}
