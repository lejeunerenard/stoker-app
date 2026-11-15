const b4a = require('b4a')
const { getEncoding } = require('../spec/hyperschema/index.js')

// The FQN of the generated schema module includes the '@' of the namespace
const tagEncoding = getEncoding('@timeseries-db/tag')

// Canonical form of a tag set: pairs sorted by key, each encoded with the
// 'tag' struct so pairs are length-prefixed. The single implementation is
// shared with the main module so the 'series-ids' primary key and the index
// maps can never disagree.
function normalizeTags(tags) {
  const sorted = tags.slice(0).sort((a, b) => (a.key > b.key) - (a.key < b.key))

  const state = { start: 0, end: 0, buffer: null }
  for (const tag of sorted) tagEncoding.preencode(state, tag)
  state.buffer = b4a.alloc(state.end)
  for (const tag of sorted) tagEncoding.encode(state, tag)

  return state.buffer
}

// The matching decode used on reads: a canonical tag buffer back to plain
// pairs so users round-trip objects and never handle buffers
function denormalizeTags(buffer) {
  const state = { start: 0, end: buffer.byteLength, buffer }
  const tags = []

  while (state.start < state.end) tags.push(tagEncoding.decode(state))

  return tags
}

// Index map over the normalized 'tags' buffer of a 'series-ids' record, one
// row per tag pair
function tagIndex(record, context) {
  return denormalizeTags(record.tags)
}

function fieldIndex(record, context) {
  return [record.field]
}

module.exports = { tagIndex, fieldIndex, normalizeTags, denormalizeTags }
