/*
 * Scoring and progress rules: stars for a run, merging saved progress, level unlock/order
 * queries over LEVELS, and chapter progress summaries. Pure functions only.
 */

import { LEVELS } from './levels/index.ts'
import type { ChapterId, LevelDef, LevelProgress, RunResult, SaveData } from './types.ts'

/** 0 on fail; else 1 base star, +1 for placing at or under par, +1 for the star token (or, on
 *  levels with no star fixture, +1 on success so 3 stars stay reachable). */
export function starsFor(level: LevelDef, result: RunResult, placedCount: number): number {
  if (result.outcome !== 'success') return 0
  let stars = 1
  if (placedCount <= level.parPieces) stars += 1
  const hasStarFixture = level.fixtures.some((f) => f.kind === 'star')
  if (hasStarFixture) {
    if (result.starCollected) stars += 1
  } else {
    stars += 1
  }
  return stars
}

export function mergeProgress(
  prev: LevelProgress | undefined,
  stars: number,
  placedCount: number,
  success: boolean,
): LevelProgress {
  const prevCompleted = prev?.completed ?? false
  const prevStars = prev?.stars ?? 0
  const prevBestPieces = prev?.bestPieces ?? null
  const completed = prevCompleted || success
  const bestStars = Math.max(prevStars, stars)
  const bestPieces =
    success && (prevBestPieces === null || placedCount < prevBestPieces) ? placedCount : prevBestPieces
  return { completed, stars: bestStars, bestPieces }
}

/** The first level of LEVELS is always unlocked; any other level requires the previous level
 *  (in LEVELS order) to be completed. */
export function isUnlocked(levelId: number, save: SaveData): boolean {
  const index = LEVELS.findIndex((level) => level.id === levelId)
  if (index <= 0) return index === 0
  const previous = LEVELS[index - 1]
  return save.levels[previous.id]?.completed ?? false
}

export function totalStars(save: SaveData): number {
  let total = 0
  for (const level of LEVELS) total += save.levels[level.id]?.stars ?? 0
  return total
}

/** The next level after `levelId` in LEVELS order, or null if it is the last (or unknown). */
export function nextLevelId(levelId: number): number | null {
  const index = LEVELS.findIndex((level) => level.id === levelId)
  if (index === -1 || index === LEVELS.length - 1) return null
  return LEVELS[index + 1].id
}

export function chapterProgress(
  chapter: ChapterId,
  save: SaveData,
): { stars: number; max: number; completed: number; total: number } {
  const levels = LEVELS.filter((level) => level.chapter === chapter)
  let stars = 0
  let completed = 0
  for (const level of levels) {
    const progress = save.levels[level.id]
    if (progress) {
      stars += progress.stars
      if (progress.completed) completed += 1
    }
  }
  return { stars, max: levels.length * 3, completed, total: levels.length }
}
