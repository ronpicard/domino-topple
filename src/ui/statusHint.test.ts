/*
 * Tests for src/ui/statusHint.ts — one status line per mode / editor-state branch.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { statusHint } from './statusHint.ts'
import type { EditorState, Ghost, LevelDef, PlacementProblem } from '../game/types.ts'

function makeLevel(overrides: Partial<LevelDef> = {}): LevelDef {
  return {
    id: 1,
    chapter: 'desk',
    name: 'Test level',
    hint: 'Test.',
    table: { width: 100, depth: 100 },
    fixtures: [],
    inventory: { domino: 10, tallDomino: 5, ramp: 2, stairs: 1, lever: 1, marble: 5, bridge: 2, spring: 2 },
    parPieces: 5,
    camera: { target: [0, 0, 0], distance: 100, yaw: 0, pitch: 0.5 },
    solution: [],
    ...overrides,
  }
}

function makeEditor(overrides: Partial<EditorState> = {}): EditorState {
  return {
    placed: [],
    tool: null,
    toolRotY: 0,
    ghost: null,
    selectedId: null,
    past: [],
    future: [],
    dragOrigin: null,
    nextId: 1,
    ...overrides,
  }
}

function invalidGhost(problem: PlacementProblem): Ghost {
  return { kind: 'domino', x: 0, y: 0, z: 0, rotY: 0, valid: false, problem }
}

test('run mode: default speed', () => {
  const level = makeLevel()
  const editor = makeEditor()
  assert.equal(statusHint(level, editor, 'run', false), 'Running… Press STOP to go back and edit.')
})

test('run mode: slow motion', () => {
  const level = makeLevel()
  const editor = makeEditor()
  assert.equal(statusHint(level, editor, 'run', true), 'Slow motion. Press STOP to go back and edit.')
})

test('result mode: empty', () => {
  const level = makeLevel()
  const editor = makeEditor()
  assert.equal(statusHint(level, editor, 'result', false), '')
})

test('build: invalid ghost, off table', () => {
  const level = makeLevel()
  const editor = makeEditor({ ghost: invalidGhost('offTable') })
  assert.equal(statusHint(level, editor, 'build', false), 'Keep it on the table.')
})

test('build: invalid ghost, overlap', () => {
  const level = makeLevel()
  const editor = makeEditor({ ghost: invalidGhost('overlap') })
  assert.equal(statusHint(level, editor, 'build', false), 'Too close to another piece.')
})

test('build: invalid ghost, no support', () => {
  const level = makeLevel()
  const editor = makeEditor({ ghost: invalidGhost('noSupport') })
  assert.equal(statusHint(level, editor, 'build', false), 'It needs flat ground underneath.')
})

test('build: invalid ghost, out of inventory', () => {
  const level = makeLevel()
  const editor = makeEditor({ ghost: invalidGhost('inventory') })
  assert.equal(statusHint(level, editor, 'build', false), 'None of those left.')
})

test('build: invalid ghost, locked', () => {
  const level = makeLevel()
  const editor = makeEditor({ ghost: invalidGhost('locked') })
  assert.equal(statusHint(level, editor, 'build', false), 'That piece is part of the level.')
})

test('build: piece selected', () => {
  const level = makeLevel()
  const editor = makeEditor({ selectedId: 'p1' })
  assert.equal(statusHint(level, editor, 'build', false), 'Drag to move it, or use the buttons above it.')
})

test('build: domino tool', () => {
  const level = makeLevel()
  const editor = makeEditor({ tool: 'domino', placed: [{ id: 'p1', kind: 'domino', x: 0, y: 0, z: 0, rotY: 0 }] })
  assert.equal(statusHint(level, editor, 'build', false), 'Drag across the table to lay a row, or tap to place one.')
})

test('build: tall domino tool', () => {
  const level = makeLevel()
  const editor = makeEditor({ tool: 'tallDomino', placed: [{ id: 'p1', kind: 'domino', x: 0, y: 0, z: 0, rotY: 0 }] })
  assert.equal(statusHint(level, editor, 'build', false), 'Drag across the table to lay a row, or tap to place one.')
})

test('build: other tool', () => {
  const level = makeLevel()
  const editor = makeEditor({ tool: 'ramp', placed: [{ id: 'p1', kind: 'domino', x: 0, y: 0, z: 0, rotY: 0 }] })
  assert.equal(statusHint(level, editor, 'build', false), 'Tap the table to place a ramp. Turn it before placing with ⟲ ⟳.')
})

test('build: nothing placed shows the level hint', () => {
  const level = makeLevel({ hint: 'Lay a row from the pendulum to the bell.' })
  const editor = makeEditor({ tool: 'domino' })
  assert.equal(statusHint(level, editor, 'build', false), 'Lay a row from the pendulum to the bell.')
})

test('build: invalid ghost beats the level hint', () => {
  const level = makeLevel({ hint: 'Lay a row.' })
  const editor = makeEditor({ tool: 'domino', ghost: invalidGhost('offTable') })
  assert.equal(statusHint(level, editor, 'build', false), 'Keep it on the table.')
})

test('build: hand tool, nothing placed, no level hint', () => {
  const level = makeLevel({ hint: '' })
  const editor = makeEditor()
  assert.equal(statusHint(level, editor, 'build', false), 'Pick a piece below to start building.')
})

test('build: hand tool, something placed', () => {
  const level = makeLevel()
  const editor = makeEditor({
    placed: [{ id: 'p1', kind: 'domino', x: 0, y: 0, z: 0, rotY: 0 }],
  })
  assert.equal(statusHint(level, editor, 'build', false), 'Drag to move the view. Tap a piece to edit it. Press GO when ready.')
})
