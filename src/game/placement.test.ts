/*
 * Tests for src/game/placement.ts — grid snapping, overlap/support checks, path poses.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  footprintsOverlap,
  posesAlongPath,
  resolveCandidate,
  restoreLayout,
  snap,
  snapAngle,
  supportHeight,
  validateLayout,
} from './placement.ts'
import type { Footprint, LevelDef, PlacedPiece } from './types.ts'

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

test('snap rounds to the grid', () => {
  assert.equal(snap(2.3), 2)
  assert.equal(snap(2.6), 3)
  assert.equal(snap(-2.6), -3)
})

test('snapAngle normalises to (-pi, pi]', () => {
  const step = Math.PI / 12
  assert.equal(snapAngle(step * 2.4), step * 2)
  // Something just past pi should wrap to just past -pi.
  const wrapped = snapAngle(Math.PI + step / 2)
  assert.ok(wrapped > -Math.PI && wrapped <= Math.PI)
})

test('footprintsOverlap: axis-aligned boxes overlap when they intersect, not when merely touching', () => {
  const a: Footprint = { cx: 0, cz: 0, hx: 1, hz: 1, rotY: 0 }
  const touching: Footprint = { cx: 2, cz: 0, hx: 1, hz: 1, rotY: 0 }
  const overlapping: Footprint = { cx: 1.9, cz: 0, hx: 1, hz: 1, rotY: 0 }
  assert.equal(footprintsOverlap(a, touching), false)
  assert.equal(footprintsOverlap(a, overlapping), true)
})

test('footprintsOverlap: rotated boxes (SAT)', () => {
  const a: Footprint = { cx: 0, cz: 0, hx: 3, hz: 1, rotY: 0 }
  // A long rectangle rotated 90 degrees crossing through the middle of `a`.
  const b: Footprint = { cx: 0, cz: 0, hx: 3, hz: 1, rotY: Math.PI / 2 }
  assert.equal(footprintsOverlap(a, b), true)
  // Moved far enough away along both axes that even rotated corners can't reach.
  const c: Footprint = { cx: 20, cz: 20, hx: 3, hz: 1, rotY: Math.PI / 2 }
  assert.equal(footprintsOverlap(a, c), false)
})

test('resolveCandidate: off table when a corner is outside the table rect', () => {
  const level = makeLevel({ table: { width: 20, depth: 20 } })
  const candidate = resolveCandidate(level, [], 'domino', 9.8, 0, 0, 'p1')
  assert.equal(candidate.ok, false)
  assert.equal(candidate.problem, 'offTable')
})

test('resolveCandidate: no support off the table entirely fails with offTable, not noSupport', () => {
  const level = makeLevel({ table: { width: 20, depth: 20 } })
  const candidate = resolveCandidate(level, [], 'domino', 50, 50, 0, 'p1')
  assert.equal(candidate.problem, 'offTable')
})

test('domino on a stairs tread gets y = 6 / 4 / 2', () => {
  const stairs: PlacedPiece = { id: 'f-stairs', kind: 'stairs', x: 0, y: 0, z: 0, rotY: 0, locked: true }
  const level2 = makeLevel({ table: { width: 60, depth: 40 }, fixtures: [stairs] })
  const treads = [
    { x: -6, y: 6 },
    { x: 0, y: 4 },
    { x: 6, y: 2 },
  ]
  for (const tread of treads) {
    const candidate = resolveCandidate(level2, [], 'domino', tread.x, 0, 0, 'p1')
    assert.equal(candidate.ok, true, `tread at x=${tread.x} should be placeable`)
    assert.equal(candidate.piece.y, tread.y, `tread at x=${tread.x} expects y=${tread.y}`)
  }
})

test('domino on a platform gets y = 10', () => {
  const platform: PlacedPiece = { id: 'f-platform', kind: 'platform', x: 0, y: 0, z: 0, rotY: 0, locked: true }
  const level = makeLevel({ table: { width: 60, depth: 40 }, fixtures: [platform] })
  const candidate = resolveCandidate(level, [], 'domino', 0, 0, 0, 'p1')
  assert.equal(candidate.ok, true)
  assert.equal(candidate.piece.y, 10)
})

test('bridge spanning two platforms gets y = 10, and a domino fits underneath the bridge on the platforms', () => {
  // Two platforms (half extent 15 x 10) separated by a gap the 15-half-extent bridge can span.
  const left: PlacedPiece = { id: 'f-left', kind: 'platform', x: -20, y: 0, z: 0, rotY: 0, locked: true }
  const right: PlacedPiece = { id: 'f-right', kind: 'platform', x: 20, y: 0, z: 0, rotY: 0, locked: true }
  const level = makeLevel({ table: { width: 120, depth: 40 }, fixtures: [left, right] })

  const bridgeCandidate = resolveCandidate(level, [], 'bridge', 0, 0, 0, 'bridge1')
  assert.equal(bridgeCandidate.ok, true)
  assert.equal(bridgeCandidate.piece.y, 10)

  // A domino placed on top of a platform (not under the bridge's footprint over the gap) should
  // be allowed: it sits at y=10 on the platform, well below/beside the bridge deck.
  const dominoCandidate = resolveCandidate(level, [bridgeCandidate.piece], 'domino', -20, 0, 0, 'd1')
  assert.equal(dominoCandidate.ok, true)
  assert.equal(dominoCandidate.piece.y, 10)
})

test('supportHeight returns null with no support under the centre', () => {
  const level = makeLevel({ table: { width: 10, depth: 10 } })
  const f: Footprint = { cx: 50, cz: 50, hx: 1, hz: 1, rotY: 0 }
  assert.equal(supportHeight(f, level.table, []), null)
})

test('resolveCandidate: overlap rejected, touching allowed', () => {
  const level = makeLevel({ table: { width: 60, depth: 40 } })
  const first = resolveCandidate(level, [], 'domino', 0, 0, 0, 'p1')
  assert.equal(first.ok, true)
  const placed = [first.piece]
  // Domino half extents: [0.6, 4, 2]. Placing another right on top overlaps.
  const overlapping = resolveCandidate(level, placed, 'domino', 0.5, 0, 0, 'p2')
  assert.equal(overlapping.ok, false)
  assert.equal(overlapping.problem, 'overlap')
  // Far enough away (> 1.2 apart in x, the sum of both half extents) to clear.
  const touching = resolveCandidate(level, placed, 'domino', 2, 0, 0, 'p3')
  assert.equal(touching.ok, true)
})

test('resolveCandidate: inventory exhausted only blocks new placements', () => {
  const level = makeLevel({ table: { width: 60, depth: 40 }, inventory: { domino: 1 } })
  const first = resolveCandidate(level, [], 'domino', 0, 0, 0, 'p1')
  assert.equal(first.ok, true)
  const placed = [first.piece]
  const second = resolveCandidate(level, placed, 'domino', 10, 0, 0, 'p2')
  assert.equal(second.ok, false)
  assert.equal(second.problem, 'inventory')
  // Moving the existing piece (ignoreId set) is not blocked by inventory.
  const moved = resolveCandidate(level, placed, 'domino', 10, 0, 0, 'p1', 'p1')
  assert.equal(moved.ok, true)
})

test('posesAlongPath: straight +X path has rotY 0 and correct spacing', () => {
  const poses = posesAlongPath(
    [
      [0, 0],
      [20, 0],
    ],
    5,
  )
  assert.equal(poses.length, 5)
  for (let i = 0; i < poses.length; i++) {
    assert.ok(Math.abs(poses[i].x - i * 5) < 1e-9)
    assert.ok(Math.abs(poses[i].z - 0) < 1e-9)
    assert.ok(Math.abs(poses[i].rotY - 0) < 1e-9)
  }
})

test('posesAlongPath: +Z path has rotY -pi/2', () => {
  const poses = posesAlongPath(
    [
      [0, 0],
      [0, 15],
    ],
    5,
  )
  assert.equal(poses.length, 4)
  for (const p of poses) {
    assert.ok(Math.abs(p.rotY - -Math.PI / 2) < 1e-9)
  }
})

test('validateLayout: reports the first invalid piece', () => {
  const level = makeLevel({ table: { width: 60, depth: 40 } })
  const placed: PlacedPiece[] = [
    { id: 'p1', kind: 'domino', x: 0, y: 4, z: 0, rotY: 0 },
    { id: 'p2', kind: 'domino', x: 0.2, y: 4, z: 0, rotY: 0 },
  ]
  const result = validateLayout(level, placed)
  assert.ok(result)
  assert.equal(result?.id, 'p2')
  assert.equal(result?.problem, 'overlap')
})

test('validateLayout: a valid layout returns null', () => {
  const level = makeLevel({ table: { width: 60, depth: 40 } })
  const placed: PlacedPiece[] = [
    { id: 'p1', kind: 'domino', x: 0, y: 4, z: 0, rotY: 0 },
    { id: 'p2', kind: 'domino', x: 5, y: 4, z: 0, rotY: 0 },
  ]
  assert.equal(validateLayout(level, placed), null)
})

test('restoreLayout: keeps legal pieces and drops off-table, overlapping and over-inventory ones', () => {
  const level = makeLevel({ inventory: { domino: 2 } })
  const restored = restoreLayout(level, [
    { id: 'p1', kind: 'domino', x: 0, y: 0, z: 0, rotY: 0 },
    { id: 'p2', kind: 'domino', x: 0.2, y: 0, z: 0, rotY: 0 }, // overlaps p1
    { id: 'p3', kind: 'domino', x: 1e300, y: -1e300, z: 0, rotY: 0 }, // off the table
    { id: 'p4', kind: 'domino', x: 20, y: 50, z: 0, rotY: 0 },
    { id: 'p5', kind: 'domino', x: -20, y: 0, z: 0, rotY: 0 }, // beyond the tray's 2 dominoes
  ])
  assert.deepEqual(restored.map((p) => p.id), ['p1', 'p4'])
  assert.equal(restored[1].y, 0, 'height is recomputed, not trusted')
})
