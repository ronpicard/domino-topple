import { test } from 'node:test'
import assert from 'node:assert/strict'

import { LEVELS } from './levels/index.ts'
import { formatRoute, parseHash } from './routes.ts'

test('parseHash: empty and root hash are the menu', () => {
  assert.deepEqual(parseHash(''), { name: 'menu' })
  assert.deepEqual(parseHash('#/'), { name: 'menu' })
  assert.deepEqual(parseHash('#'), { name: 'menu' })
})

test('parseHash: sandbox', () => {
  assert.deepEqual(parseHash('#/sandbox'), { name: 'sandbox' })
})

test('parseHash: a level id present in LEVELS', () => {
  const level = LEVELS[0]
  assert.deepEqual(parseHash(`#/level/${level.id}`), { name: 'level', id: level.id })
})

test('parseHash: an unknown level id falls back to the menu', () => {
  const unknownId = Math.max(...LEVELS.map((l) => l.id)) + 1000
  assert.deepEqual(parseHash(`#/level/${unknownId}`), { name: 'menu' })
})

test('parseHash: a non-positive-integer level id falls back to the menu', () => {
  assert.deepEqual(parseHash('#/level/0'), { name: 'menu' })
  assert.deepEqual(parseHash('#/level/-1'), { name: 'menu' })
  assert.deepEqual(parseHash('#/level/1.5'), { name: 'menu' })
  assert.deepEqual(parseHash('#/level/abc'), { name: 'menu' })
})

test('parseHash: unrecognised paths fall back to the menu', () => {
  assert.deepEqual(parseHash('#/nope'), { name: 'menu' })
  assert.deepEqual(parseHash('#/level/'), { name: 'menu' })
})

test('formatRoute: round-trips through parseHash', () => {
  const level = LEVELS[0]
  assert.equal(formatRoute({ name: 'menu' }), '#/')
  assert.equal(formatRoute({ name: 'sandbox' }), '#/sandbox')
  assert.equal(formatRoute({ name: 'level', id: level.id }), `#/level/${level.id}`)
  assert.deepEqual(parseHash(formatRoute({ name: 'level', id: level.id })), { name: 'level', id: level.id })
})
