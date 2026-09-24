import { test } from 'node:test'
import assert from 'node:assert/strict'

import { LEVELS } from './levels/index.ts'
import { chapterProgress, isUnlocked, mergeProgress, nextLevelId, starsFor, totalStars } from './rules.ts'
import type { LevelDef, RunResult, SaveData } from './types.ts'

function makeLevel(overrides: Partial<LevelDef> = {}): LevelDef {
  return {
    id: 1,
    chapter: 'desk',
    name: 'Test Level',
    hint: 'hint',
    table: { width: 120, depth: 60 },
    fixtures: [{ id: 'f-trigger', kind: 'pendulum', x: -45, y: 0, z: 0, rotY: 0, locked: true }],
    inventory: { domino: 20 },
    parPieces: 10,
    camera: { target: [0, 0, 0], distance: 150, yaw: 0, pitch: 0.7 },
    solution: [],
    ...overrides,
  }
}

function makeSave(overrides: Partial<SaveData> = {}): SaveData {
  return { version: 1, levels: {}, settings: { muted: false, quality: 'auto', reducedMotion: false }, seenCoach: false, ...overrides }
}

// ---------------------------------------------------------------------------------------------
// starsFor

test('starsFor: 0 stars on fail regardless of piece count', () => {
  const level = makeLevel()
  const result: RunResult = { outcome: 'fail', starCollected: false, time: 5 }
  assert.equal(starsFor(level, result, 3), 0)
})

test('starsFor: 2 stars on success over par, no star fixture (third star still awarded)', () => {
  const level = makeLevel({ parPieces: 10 })
  const result: RunResult = { outcome: 'success', starCollected: false, time: 5 }
  assert.equal(starsFor(level, result, 15), 2)
})

test('starsFor: no star fixture always awards the third star on success', () => {
  const level = makeLevel({ parPieces: 10 })
  const result: RunResult = { outcome: 'success', starCollected: false, time: 5 }
  assert.equal(starsFor(level, result, 10), 3)
})

test('starsFor: with a star fixture, third star requires collecting it', () => {
  const level = makeLevel({
    parPieces: 10,
    fixtures: [
      { id: 'f-trigger', kind: 'pendulum', x: -45, y: 0, z: 0, rotY: 0, locked: true },
      { id: 'f-star', kind: 'star', x: 0, y: 0, z: 0, rotY: 0, locked: true },
    ],
  })
  const missed: RunResult = { outcome: 'success', starCollected: false, time: 5 }
  const collected: RunResult = { outcome: 'success', starCollected: true, time: 5 }
  assert.equal(starsFor(level, missed, 10), 2)
  assert.equal(starsFor(level, collected, 10), 3)
})

// ---------------------------------------------------------------------------------------------
// mergeProgress

test('mergeProgress: first successful run', () => {
  const progress = mergeProgress(undefined, 2, 12, true)
  assert.deepEqual(progress, { completed: true, stars: 2, bestPieces: 12 })
})

test('mergeProgress: failed run keeps prior progress, never regresses', () => {
  const prev = { completed: true, stars: 3, bestPieces: 8 }
  const progress = mergeProgress(prev, 0, 20, false)
  assert.deepEqual(progress, { completed: true, stars: 3, bestPieces: 8 })
})

test('mergeProgress: keeps the best star count and fewest pieces across runs', () => {
  const prev = { completed: true, stars: 1, bestPieces: 15 }
  const progress = mergeProgress(prev, 2, 10, true)
  assert.deepEqual(progress, { completed: true, stars: 2, bestPieces: 10 })
})

test('mergeProgress: a worse successful run does not raise bestPieces', () => {
  const prev = { completed: true, stars: 3, bestPieces: 8 }
  const progress = mergeProgress(prev, 1, 20, true)
  assert.deepEqual(progress, { completed: true, stars: 3, bestPieces: 8 })
})

// ---------------------------------------------------------------------------------------------
// isUnlocked / nextLevelId / totalStars / chapterProgress — hold for any non-empty LEVELS

test('isUnlocked: the first level in LEVELS is always unlocked', () => {
  assert.ok(LEVELS.length > 0)
  const save = makeSave()
  assert.equal(isUnlocked(LEVELS[0].id, save), true)
})

test('isUnlocked: an unknown level id is locked', () => {
  const save = makeSave()
  assert.equal(isUnlocked(-1, save), false)
})

test('nextLevelId: the last level in LEVELS has no next level', () => {
  const last = LEVELS[LEVELS.length - 1]
  assert.equal(nextLevelId(last.id), null)
})

test('nextLevelId: an unknown level id has no next level', () => {
  assert.equal(nextLevelId(-1), null)
})

test('totalStars: sums stars across all recorded levels', () => {
  const save = makeSave({
    levels: {
      [LEVELS[0].id]: { completed: true, stars: 2, bestPieces: 5 },
    },
  })
  assert.equal(totalStars(save), 2)
})

test('totalStars: zero with no recorded progress', () => {
  assert.equal(totalStars(makeSave()), 0)
})

test('chapterProgress: counts stars and completions for the given chapter only', () => {
  const chapter = LEVELS[0].chapter
  const save = makeSave({
    levels: { [LEVELS[0].id]: { completed: true, stars: 3, bestPieces: 4 } },
  })
  const levelsInChapter = LEVELS.filter((level) => level.chapter === chapter)
  const progress = chapterProgress(chapter, save)
  assert.equal(progress.total, levelsInChapter.length)
  assert.equal(progress.max, levelsInChapter.length * 3)
  assert.equal(progress.stars, 3)
  assert.equal(progress.completed, 1)
})

test('totalStars: ignores progress recorded for ids that are not levels', () => {
  const save = makeSave({
    levels: {
      [LEVELS[0].id]: { completed: true, stars: 3, bestPieces: 5 },
      999: { completed: true, stars: 3, bestPieces: 1 },
    },
  })
  assert.equal(totalStars(save), 3)
})
