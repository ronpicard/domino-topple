/*
 * Tests for src/game/editor.ts — the pure build-mode reducer.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { allPieces, editorReducer, initialEditor } from './editor.ts'
import type { LevelDef } from './types.ts'

function makeLevel(overrides: Partial<LevelDef> = {}): LevelDef {
  return {
    id: 1,
    chapter: 'desk',
    name: 'Test level',
    hint: 'Test.',
    table: { width: 100, depth: 100 },
    fixtures: [],
    inventory: { domino: 3, tallDomino: 5, ramp: 2, stairs: 1, lever: 1, marble: 5, bridge: 2, spring: 2 },
    parPieces: 5,
    camera: { target: [0, 0, 0], distance: 100, yaw: 0, pitch: 0.5 },
    solution: [],
    ...overrides,
  }
}

test('placeAtGhost places the piece at the ghost pose and clears/re-resolves the ghost', () => {
  const level = makeLevel()
  let state = initialEditor()
  state = editorReducer(level, state, { type: 'selectTool', kind: 'domino' })
  state = editorReducer(level, state, { type: 'hover', x: 0, z: 0 })
  assert.ok(state.ghost?.valid)
  state = editorReducer(level, state, { type: 'placeAtGhost' })
  assert.equal(state.placed.length, 1)
  assert.equal(state.placed[0].id, 'p1')
  assert.equal(state.placed[0].kind, 'domino')
  // Ghost re-resolved at the same spot, now overlapping the just-placed piece.
  assert.equal(state.ghost?.valid, false)
  assert.equal(state.ghost?.problem, 'overlap')
})

test('placePath stops laying dominoes when inventory runs out', () => {
  const level = makeLevel({ inventory: { domino: 2 } })
  let state = initialEditor()
  state = editorReducer(level, state, { type: 'selectTool', kind: 'domino' })
  // A long straight path (spacing 4.8) that would need many more than 2 dominoes.
  state = editorReducer(level, state, {
    type: 'placePath',
    points: [
      [-20, 0],
      [20, 0],
    ],
  })
  assert.equal(state.placed.length, 2)
  assert.equal(state.past.length, 1)
})

test('undo/redo round trip restores layout and history', () => {
  const level = makeLevel()
  let state = initialEditor()
  state = editorReducer(level, state, { type: 'selectTool', kind: 'domino' })
  state = editorReducer(level, state, { type: 'hover', x: 0, z: 0 })
  state = editorReducer(level, state, { type: 'placeAtGhost' })
  assert.equal(state.placed.length, 1)

  const afterPlace = state.placed
  state = editorReducer(level, state, { type: 'undo' })
  assert.equal(state.placed.length, 0)

  state = editorReducer(level, state, { type: 'redo' })
  assert.equal(state.placed.length, 1)
  assert.deepEqual(state.placed, afterPlace)
})

test('move with commit produces a single undo step', () => {
  const level = makeLevel()
  let state = initialEditor()
  state = editorReducer(level, state, { type: 'selectTool', kind: 'domino' })
  state = editorReducer(level, state, { type: 'hover', x: 0, z: 0 })
  state = editorReducer(level, state, { type: 'placeAtGhost' })
  const id = state.placed[0].id
  state = editorReducer(level, state, { type: 'select', id })
  const pastBeforeMove = state.past.length

  state = editorReducer(level, state, { type: 'move', id, x: 5, z: 0, commit: false })
  assert.equal(state.past.length, pastBeforeMove, 'uncommitted move pushes no history')
  state = editorReducer(level, state, { type: 'move', id, x: 8, z: 0, commit: false })
  assert.equal(state.past.length, pastBeforeMove)

  state = editorReducer(level, state, { type: 'move', id, x: 10, z: 0, commit: true })
  assert.equal(state.past.length, pastBeforeMove + 1, 'commit pushes exactly one history step')
  assert.equal(state.placed[0].x, 10)
  assert.equal(state.dragOrigin, null)

  state = editorReducer(level, state, { type: 'undo' })
  assert.equal(state.placed[0].x, 0, 'undo restores the pre-drag position')
})

test('rotate rejects an invalid result and leaves the piece unchanged', () => {
  // Bridge halfExtents [15, 0.5, 3]: fits unrotated on a 40-wide/8-deep table, but rotating 90
  // degrees swaps its footprint reach (needs depth >= 30), which goes off-table.
  const level = makeLevel({ table: { width: 40, depth: 8 } })
  let state = initialEditor()
  state = editorReducer(level, state, { type: 'selectTool', kind: 'bridge' })
  state = editorReducer(level, state, { type: 'hover', x: 0, z: 0 })
  state = editorReducer(level, state, { type: 'placeAtGhost' })
  assert.equal(state.placed.length, 1)
  const id = state.placed[0].id
  state = editorReducer(level, state, { type: 'select', id })
  const before = state.placed[0]

  // Rotating 90 degrees (6 steps of 15 degrees) swaps the bridge's footprint reach, which no
  // longer fits the 8-deep table, and should be rejected.
  const rotated = editorReducer(level, state, { type: 'rotate', steps: 6 })
  assert.deepEqual(rotated.placed[0], before)
})

test('fixtures cannot be removed or selected', () => {
  const level = makeLevel({
    fixtures: [{ id: 'f-goal', kind: 'bell', x: 0, y: 0, z: 0, rotY: 0, locked: true }],
  })
  let state = initialEditor()
  state = editorReducer(level, state, { type: 'select', id: 'f-goal' })
  assert.equal(state.selectedId, null)

  const beforeRemove = state
  state = editorReducer(level, state, { type: 'remove', id: 'f-goal' })
  assert.equal(state, beforeRemove, 'removing a fixture id is a no-op')
  assert.equal(allPieces(level, state).length, 1)
})

test('clearAll removes every placed piece as one undo step', () => {
  const level = makeLevel()
  let state = initialEditor()
  state = editorReducer(level, state, { type: 'selectTool', kind: 'domino' })
  state = editorReducer(level, state, { type: 'hover', x: 0, z: 0 })
  state = editorReducer(level, state, { type: 'placeAtGhost' })
  state = editorReducer(level, state, { type: 'hover', x: 10, z: 0 })
  state = editorReducer(level, state, { type: 'placeAtGhost' })
  assert.equal(state.placed.length, 2)
  const pastBefore = state.past.length

  state = editorReducer(level, state, { type: 'clearAll' })
  assert.equal(state.placed.length, 0)
  assert.equal(state.past.length, pastBefore + 1)

  state = editorReducer(level, state, { type: 'undo' })
  assert.equal(state.placed.length, 2)
})

test('initialEditor: new pieces never reuse the ids of a restored layout', () => {
  const level = makeLevel()
  let state = initialEditor([
    { id: 'p1', kind: 'domino', x: -20, y: 0, z: 0, rotY: 0 },
    { id: 'p7', kind: 'domino', x: 20, y: 0, z: 0, rotY: 0 },
  ])
  state = editorReducer(level, state, { type: 'selectTool', kind: 'tallDomino' })
  state = editorReducer(level, state, { type: 'hover', x: 0, z: 30 })
  state = editorReducer(level, state, { type: 'placeAtGhost' })
  const ids = state.placed.map((p) => p.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.includes('p8'))
})

test('reset: replaces the layout with no undo history, so undo cannot bring back another level', () => {
  const level = makeLevel()
  let state = initialEditor()
  state = editorReducer(level, state, { type: 'selectTool', kind: 'domino' })
  state = editorReducer(level, state, { type: 'hover', x: 0, z: 0 })
  state = editorReducer(level, state, { type: 'placeAtGhost' })
  state = editorReducer(level, state, { type: 'reset', placed: [] })
  assert.deepEqual(state.placed, [])
  assert.deepEqual(state.past, [])
  state = editorReducer(level, state, { type: 'undo' })
  assert.deepEqual(state.placed, [])
})
