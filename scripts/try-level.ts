/*
 * Level design helper: runs a level's reference solution (or an empty table) headlessly and
 * prints the outcome, so layouts can be tuned without the browser.
 * Usage: npm run try-level -- <levelId> [--empty]
 */

import { getLevel } from '../src/game/levels/index.ts'
import { settleHeights, validateLayout } from '../src/game/placement.ts'
import { initPhysics, runToEnd } from '../src/game/sim.ts'

const id = Number(process.argv[2])
const level = getLevel(id)
if (!level) {
  console.error(`No level with id ${process.argv[2]}`)
  process.exit(1)
}
await initPhysics()
const placed = process.argv.includes('--empty') ? [] : settleHeights(level, level.solution)
const problem = validateLayout(level, placed)
const result = runToEnd({ table: level.table, fixtures: level.fixtures }, placed)
console.log(
  JSON.stringify({ level: id, pieces: placed.length, par: level.parPieces, layoutProblem: problem, ...result }),
)
