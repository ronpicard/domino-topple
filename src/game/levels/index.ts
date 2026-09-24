/*
 * Level registry: the three chapters, their levels in play order, and the sandbox table.
 */

import type { ChapterDef, ChapterId, LevelDef } from '../types.ts'
import { DESK_LEVELS } from './desk.ts'
import { PLAYROOM_LEVELS } from './playroom.ts'
import { WORKSHOP_LEVELS } from './workshop.ts'

export const CHAPTERS: ChapterDef[] = [
  { id: 'desk', name: 'The Desk', tagline: 'Lacquered wood, green felt, and your first chains.' },
  { id: 'workshop', name: 'The Workshop', tagline: 'Levers, stairs and bridges on the workbench.' },
  { id: 'playroom', name: 'The Playroom', tagline: 'Toy cars, springs and marbles everywhere.' },
]

/** All campaign levels, ids 1..N in play order. */
export const LEVELS: LevelDef[] = [...DESK_LEVELS, ...WORKSHOP_LEVELS, ...PLAYROOM_LEVELS]

export function getLevel(id: number): LevelDef | undefined {
  return LEVELS.find((level) => level.id === id)
}

export function levelsInChapter(chapter: ChapterId): LevelDef[] {
  return LEVELS.filter((level) => level.chapter === chapter)
}

/** Unlimited pieces on a big table with a pendulum and a bell. Id 0 is never saved. */
export const SANDBOX_LEVEL: LevelDef = {
  id: 0,
  chapter: 'playroom',
  name: 'Sandbox',
  hint: 'Unlimited pieces. Build anything, then press GO.',
  table: { width: 200, depth: 120 },
  fixtures: [
    { id: 'f-trigger', kind: 'pendulum', x: -80, y: 0, z: 0, rotY: 0, locked: true },
    { id: 'f-goal', kind: 'bell', x: 85, y: 0, z: 40, rotY: 0, locked: true },
  ],
  inventory: {
    domino: -1,
    tallDomino: -1,
    ramp: -1,
    stairs: -1,
    lever: -1,
    marble: -1,
    bridge: -1,
    spring: -1,
  },
  parPieces: 0,
  camera: { target: [0, 0, 0], distance: 230, yaw: 0, pitch: 0.75 },
  solution: [],
}
