/*
 * Level content checks: every campaign level is well formed, its fixtures fit the table, its
 * reference solution is a legal layout within inventory and par, and that solution earns all
 * three stars in a headless physics run while an empty table fails.
 * Filter one chapter with: npm test -- --test-name-pattern=desk
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CHAPTERS, LEVELS } from './levels/index.ts'
import { PIECES, isPlaceable } from './pieces.ts'
import { EPS, footprintCorners, footprintsOverlap, occupiedBoxes, pointInFootprint, settleHeights, validateLayout } from './placement.ts'
import { initPhysics, runToEnd } from './sim.ts'
import type { LevelDef, PieceKind } from './types.ts'

await initPhysics()

const TRIGGERS: PieceKind[] = ['pendulum', 'car', 'marbleRamp']
const GOALS: PieceKind[] = ['bell', 'flag', 'cup']

test('levels are numbered 1..N in play order, five per chapter', () => {
  assert.equal(LEVELS.length, 15)
  LEVELS.forEach((level, i) => assert.equal(level.id, i + 1))
  for (const [c, chapter] of CHAPTERS.entries()) {
    const ids = LEVELS.filter((l) => l.chapter === chapter.id).map((l) => l.id)
    assert.deepEqual(ids, [1, 2, 3, 4, 5].map((n) => c * 5 + n), `chapter ${chapter.id}`)
  }
})

function inTable(level: LevelDef, x: number, z: number): boolean {
  return pointInFootprint(x, z, { cx: 0, cz: 0, hx: level.table.width / 2 + EPS, hz: level.table.depth / 2 + EPS, rotY: 0 })
}

for (const level of LEVELS) {
  const name = `${level.chapter} level ${level.id} "${level.name}"`

  test(`${name}: fixtures are well formed`, () => {
    const ids = new Set<string>()
    for (const f of level.fixtures) {
      assert.ok(!ids.has(f.id), `duplicate fixture id ${f.id}`)
      ids.add(f.id)
      assert.equal(f.locked, true, `fixture ${f.id} must be locked`)
      for (const [x, z] of footprintCorners({ cx: f.x, cz: f.z, hx: PIECES[f.kind].halfExtents[0], hz: PIECES[f.kind].halfExtents[2], rotY: f.rotY })) {
        assert.ok(inTable(level, x, z), `fixture ${f.id} pokes off the table`)
      }
    }
    assert.equal(level.fixtures.filter((f) => GOALS.includes(f.kind)).length, 1, 'exactly one goal')
    assert.ok(level.fixtures.some((f) => TRIGGERS.includes(f.kind)), 'at least one trigger')
    assert.ok(level.fixtures.filter((f) => f.kind === 'star').length <= 1, 'at most one star')
    for (let i = 0; i < level.fixtures.length; i++) {
      for (let j = i + 1; j < level.fixtures.length; j++) {
        for (const a of occupiedBoxes(level.fixtures[i])) {
          for (const b of occupiedBoxes(level.fixtures[j])) {
            const vertical = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > EPS
            assert.ok(!(vertical && footprintsOverlap(a.footprint, b.footprint)), `fixtures ${level.fixtures[i].id} and ${level.fixtures[j].id} overlap`)
          }
        }
      }
    }
    assert.ok(inTable(level, level.camera.target[0], level.camera.target[2]), 'camera target on the table')
    assert.ok(level.hint.length > 0 && level.hint.length <= 110, 'hint is one short line')
  })

  test(`${name}: solution is a legal layout within par`, () => {
    const solution = settleHeights(level, level.solution)
    assert.ok(solution.length > 0, 'has a solution')
    assert.ok(solution.length <= level.parPieces, `solution uses ${solution.length} pieces, par ${level.parPieces}`)
    assert.equal(validateLayout(level, solution), null)
    for (const p of solution) assert.ok(isPlaceable(p.kind), `${p.id} is not a tray piece`)
  })

  test(`${name}: solution earns three stars and an empty table fails`, () => {
    const sim = { table: level.table, fixtures: level.fixtures }
    const solved = runToEnd(sim, settleHeights(level, level.solution))
    assert.equal(solved.outcome, 'success', 'solution reaches the goal')
    if (level.fixtures.some((f) => f.kind === 'star')) assert.ok(solved.starCollected, 'solution collects the star')
    assert.equal(runToEnd(sim, []).outcome, 'fail', 'an empty table must not reach the goal')
  })
}
