/*
 * Tests for the Rapier simulation: determinism, the standard pendulum/domino-row success and
 * fail cases, every piece kind constructing without throwing, and each mechanism (a lone
 * domino staying put, the marble chute, the lever, the spring, and the goal/star/impacts).
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { PIECES, rotateVec } from './pieces.ts'
import type { SimLevel } from './sim.ts'
import { FIXED_DT, Simulation, initPhysics, runToEnd } from './sim.ts'
import type { PieceKind, PlacedPiece } from './types.ts'

await initPhysics()

const TABLE = { width: 200, depth: 120 }

function level(fixtures: PlacedPiece[]): SimLevel {
  return { table: TABLE, fixtures }
}

function dominoRow(count: number, startX: number, spacing = 4.8): PlacedPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `d${i}`,
    kind: 'domino' as const,
    x: startX + i * spacing,
    y: 0,
    z: 0,
    rotY: 0,
  }))
}

function pendulumFixture(x: number): PlacedPiece {
  return { id: 'pendulum', kind: 'pendulum', x, y: 0, z: 0, rotY: 0, locked: true }
}

function bellFixture(x: number): PlacedPiece {
  return { id: 'bell', kind: 'bell', x, y: 0, z: 0, rotY: 0, locked: true }
}

function flagFixture(x: number): PlacedPiece {
  return { id: 'flag', kind: 'flag', x, y: 0, z: 0, rotY: 0, locked: true }
}

function stepFor(sim: Simulation, seconds: number): void {
  const steps = Math.round(seconds / FIXED_DT)
  for (let i = 0; i < steps; i++) sim.step()
}

test('determinism: two runs of a pendulum + 12-domino row give bitwise-identical transforms', () => {
  const run = () => {
    const sim = new Simulation(level([pendulumFixture(0)]), dominoRow(12, 3))
    stepFor(sim, 6)
    const snapshot = sim.transforms.slice()
    sim.dispose()
    return snapshot
  }
  const a = run()
  const b = run()
  assert.deepStrictEqual(a, b)
})

test('pendulum + domino row + bell succeeds; the same layout without dominoes fails quickly', () => {
  const dominoCount = 12
  const placed = dominoRow(dominoCount, 3)
  const lastX = 3 + (dominoCount - 1) * 4.8
  const fixtures = [pendulumFixture(0), bellFixture(lastX + 6)]

  const result = runToEnd(level(fixtures), placed)
  assert.equal(result.outcome, 'success')

  const failResult = runToEnd(level(fixtures), [])
  assert.equal(failResult.outcome, 'fail')
  assert.ok(failResult.time < 10, `expected the fail to be declared before 10s, got ${failResult.time}`)
})

test('a lone domino standing on the table stays standing', () => {
  const piece: PlacedPiece = { id: 'd0', kind: 'domino', x: 0, y: 0, z: 0, rotY: 0 }
  const sim = new Simulation(level([]), [piece])
  stepFor(sim, 2)
  const dx = sim.transforms[0] - 0
  const dz = sim.transforms[2] - 0
  const drift = Math.sqrt(dx * dx + dz * dz)
  assert.ok(drift < 0.1, `expected drift < 0.1cm, got ${drift}`)
  sim.dispose()
})

test('every piece kind can be constructed alone without throwing; fully-fixed pieces have no bodies', () => {
  const fullyFixedKinds: PieceKind[] = ['ramp', 'stairs', 'bridge', 'cup', 'bell', 'block', 'platform']
  for (const kind of Object.keys(PIECES) as PieceKind[]) {
    const piece: PlacedPiece = { id: 'p', kind, x: 0, y: 0, z: 0, rotY: 0 }
    const sim = new Simulation(level([piece]), [])
    stepFor(sim, 0.25)
    if (fullyFixedKinds.includes(kind)) {
      assert.equal(sim.bodies.length, 0, `expected "${kind}" to have no dynamic bodies`)
    }
    sim.dispose()
  }
})

test('marble chute: the marble leaves the chute within 3s', () => {
  const piece: PlacedPiece = { id: 'chute', kind: 'marbleRamp', x: 0, y: 0, z: 0, rotY: 0 }
  const sim = new Simulation(level([piece]), [])
  const marbleIndex = sim.bodies.findIndex((b) => b.kind === 'marbleRamp')
  assert.ok(marbleIndex >= 0, 'expected a marble body')

  let left = false
  for (let i = 0; i < Math.round(3 / FIXED_DT); i++) {
    sim.step()
    if (sim.transforms[marbleIndex * 7] > piece.x + 15) {
      left = true
      break
    }
  }
  assert.ok(left, 'expected the marble to leave the chute within 3s')
  sim.dispose()
})

test('lever: a marble dropped onto one end tips the plank so the other end rises', () => {
  const lever: PlacedPiece = { id: 'lever', kind: 'lever', x: 0, y: 0, z: 0, rotY: 0 }
  const marble: PlacedPiece = { id: 'marble', kind: 'marble', x: -10, y: 20, z: 0, rotY: 0 }
  const sim = new Simulation(level([lever]), [marble])
  const plankIndex = sim.bodies.findIndex((b) => b.kind === 'lever')
  assert.ok(plankIndex >= 0, 'expected the plank body')

  const farLocal: [number, number, number] = [13, 0, 0]
  const farHeightAt = (): number => {
    const o = plankIndex * 7
    const q: [number, number, number, number] = [
      sim.transforms[o + 3],
      sim.transforms[o + 4],
      sim.transforms[o + 5],
      sim.transforms[o + 6],
    ]
    const offset = rotateVec(q, farLocal)
    return sim.transforms[o + 1] + offset[1]
  }
  const before = farHeightAt()
  stepFor(sim, 3)
  const after = farHeightAt()
  assert.ok(after - before > 2, `expected the far end to rise > 2cm, rose ${after - before}`)
  sim.dispose()
})

test('spring: a marble dropped onto a spring gains upward velocity > 150 cm/s', () => {
  const spring: PlacedPiece = { id: 'spring', kind: 'spring', x: 0, y: 0, z: 0, rotY: 0 }
  const marble: PlacedPiece = { id: 'marble', kind: 'marble', x: 0, y: 15, z: 0, rotY: 0 }
  const sim = new Simulation(level([]), [spring, marble])
  const marbleIndex = sim.bodies.findIndex((b) => b.pieceId === 'marble')
  assert.ok(marbleIndex >= 0, 'expected the marble body')

  let maxUpVel = 0
  let prevY = sim.transforms[marbleIndex * 7 + 1]
  for (let i = 0; i < Math.round(3 / FIXED_DT); i++) {
    sim.step()
    const y = sim.transforms[marbleIndex * 7 + 1]
    const upVel = (y - prevY) / FIXED_DT
    if (upVel > maxUpVel) maxUpVel = upVel
    prevY = y
  }
  assert.ok(maxUpVel > 150, `expected upward velocity > 150cm/s, got ${maxUpVel}`)
  sim.dispose()
})

test('flag knocked by a domino row succeeds; a star placed in the row is collected', () => {
  const rowCount = 10
  const starIndex = 5
  const startX = 3
  const spacing = 4.8
  const placed: PlacedPiece[] = []
  for (let i = 0; i < rowCount; i++) {
    const x = startX + i * spacing
    placed.push(
      i === starIndex
        ? { id: 'star', kind: 'star', x, y: 0, z: 0, rotY: 0 }
        : { id: `d${i}`, kind: 'domino', x, y: 0, z: 0, rotY: 0 },
    )
  }
  const lastX = startX + (rowCount - 1) * spacing
  const fixtures = [pendulumFixture(0), flagFixture(lastX + 1)]

  const result = runToEnd(level(fixtures), placed)
  assert.equal(result.outcome, 'success')
  assert.equal(result.starCollected, true)
})

test('impacts: the domino row run produces impact events with strengths in (0, 1]', () => {
  const sim = new Simulation(level([pendulumFixture(0)]), dominoRow(12, 3))
  const strengths: number[] = []
  for (let i = 0; i < Math.round(6 / FIXED_DT); i++) {
    const events = sim.step()
    for (const impact of events.impacts) strengths.push(impact.strength)
  }
  assert.ok(strengths.length > 0, 'expected at least one impact event')
  for (const s of strengths) assert.ok(s > 0 && s <= 1, `strength ${s} out of range`)
  sim.dispose()
})
