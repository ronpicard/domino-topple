/*
 * localStorage persistence: save data (progress, settings, coach mark) under key
 * `domino-topple:v1`. Layouts are deliberately not persisted: a reload starts the level fresh.
 * localStorage is a trust boundary (it can be edited or corrupted out of band), so every read is
 * validated field by field and never throws.
 */

import type { LevelProgress, QualityTier, SaveData, Settings } from './types.ts'

const SAVE_KEY = 'domino-topple:v1'


export function prefersReducedMotion(): boolean {
  try {
    if (typeof matchMedia !== 'function') return false
    return matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export function defaultSave(): SaveData {
  return {
    version: 1,
    levels: {},
    settings: { muted: false, quality: 'auto', reducedMotion: prefersReducedMotion() },
    seenCoach: false,
  }
}

const QUALITY_TIERS: QualityTier[] = ['high', 'medium', 'low']

function parseSettings(raw: unknown): Settings {
  const fallback = { muted: false, quality: 'auto' as const, reducedMotion: prefersReducedMotion() }
  if (typeof raw !== 'object' || raw === null) return fallback
  const settings = raw as Record<string, unknown>
  const muted = typeof settings.muted === 'boolean' ? settings.muted : fallback.muted
  const quality =
    settings.quality === 'auto' || (typeof settings.quality === 'string' && QUALITY_TIERS.includes(settings.quality as QualityTier))
      ? (settings.quality as QualityTier | 'auto')
      : fallback.quality
  const reducedMotion = typeof settings.reducedMotion === 'boolean' ? settings.reducedMotion : fallback.reducedMotion
  return { muted, quality, reducedMotion }
}

function parseLevelProgress(raw: unknown): LevelProgress | null {
  if (typeof raw !== 'object' || raw === null) return null
  const progress = raw as Record<string, unknown>
  if (typeof progress.completed !== 'boolean') return null
  if (typeof progress.stars !== 'number' || !Number.isInteger(progress.stars)) return null
  if (progress.stars < 0 || progress.stars > 3) return null
  const bestPieces =
    progress.bestPieces === null
      ? null
      : typeof progress.bestPieces === 'number' && Number.isInteger(progress.bestPieces) && progress.bestPieces >= 0
        ? progress.bestPieces
        : null
  if (progress.bestPieces !== null && bestPieces === null) return null
  return { completed: progress.completed, stars: progress.stars, bestPieces }
}

function parseLevels(raw: unknown): Record<number, LevelProgress> {
  const levels: Record<number, LevelProgress> = {}
  if (typeof raw !== 'object' || raw === null) return levels
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = Number(key)
    // Level ids start at 1; 0 is the sandbox, which keeps no progress.
    if (!Number.isInteger(id) || id < 1) continue
    const progress = parseLevelProgress(value)
    if (progress) levels[id] = progress
  }
  return levels
}

/** Validate an unknown value into a SaveData, dropping bad fields; never throws. */
export function parseSave(raw: unknown): SaveData {
  const fallback = defaultSave()
  if (typeof raw !== 'object' || raw === null) return fallback
  const save = raw as Record<string, unknown>
  return {
    version: 1,
    levels: parseLevels(save.levels),
    settings: parseSettings(save.settings),
    seenCoach: typeof save.seenCoach === 'boolean' ? save.seenCoach : fallback.seenCoach,
  }
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw === null) return defaultSave()
    return parseSave(JSON.parse(raw))
  } catch {
    return defaultSave()
  }
}

export function writeSave(save: SaveData): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save))
    return true
  } catch {
    return false
  }
}

