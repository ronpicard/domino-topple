/*
 * Chapter visual themes: the colour palette, table dressing, room and lighting that give each of
 * Domino Topple's three chapters (desk / workshop / playroom) a distinct, warm diorama look.
 * Consumed by materials.ts (part materials), Diorama.tsx (table, room and lighting) and PiecesView.
 */

import type { ChapterId } from '../game/types.ts'

export interface ChapterTheme {
  /** Vertical gradient behind the diorama, top of sky to horizon (the menu backdrop). */
  background: { top: string; bottom: string }
  fog: { color: string; near: number; far: number }
  table: {
    /** Primary slab colour (walnut / brushed steel / plastic frame). */
    color: string
    roughness: number
    metalness: number
    kind: 'feltInset' | 'metalBench' | 'playmat'
    /** Secondary tone: felt inset / pegboard backdrop / second playmat check colour. */
    insetColor: string
    insetRoughness: number
  }
  tableEdge: string
  /** The room around the table: wall gradient (top / bottom), floor and baseboard. */
  room: { wall: string; wallBottom: string; floor: string; trim: string }
  /** Domino tile tones cycled by instance index; every chapter plays with ivory tiles. */
  dominoBody: string[]
  dominoPip: string
  /** Moulded-plastic piece colour (ramps, cups). */
  accent: string
  ambient: string
  hemisphere: { sky: string; ground: string }
  keyLight: { color: string; intensity: number }
}

const IVORY_TILES = ['#f6f1e6', '#f3ecdf']
const PIP_INK = '#14110e'

export const THEMES: Record<ChapterId, ChapterTheme> = {
  desk: {
    background: { top: '#2b2320', bottom: '#0e0a08' },
    fog: { color: '#120d0a', near: 1400, far: 3200 },
    table: {
      color: '#4b2c1a',
      roughness: 0.3,
      metalness: 0.05,
      kind: 'feltInset',
      insetColor: '#1f4d3a',
      insetRoughness: 0.95,
    },
    tableEdge: '#3b2114',
    room: { wall: '#6e5546', wallBottom: '#33261d', floor: '#2e2015', trim: '#5a4232' },
    dominoBody: IVORY_TILES,
    dominoPip: PIP_INK,
    accent: '#e8590c',
    ambient: '#4a3a2c',
    hemisphere: { sky: '#c4ad8e', ground: '#33241a' },
    keyLight: { color: '#ffe2b8', intensity: 2.8 },
  },
  workshop: {
    background: { top: '#2a2e33', bottom: '#0c0d0f' },
    fog: { color: '#14161a', near: 1400, far: 3200 },
    table: {
      color: '#6f767c',
      roughness: 0.55,
      metalness: 0.55,
      kind: 'metalBench',
      insetColor: '#b58e5f',
      insetRoughness: 0.85,
    },
    tableEdge: '#4c5157',
    room: { wall: '#8a939c', wallBottom: '#4c545b', floor: '#4a4d52', trim: '#2e3237' },
    dominoBody: IVORY_TILES,
    dominoPip: PIP_INK,
    accent: '#e8590c',
    ambient: '#3c4247',
    hemisphere: { sky: '#c3cbd3', ground: '#34383d' },
    keyLight: { color: '#eef3ff', intensity: 2.4 },
  },
  playroom: {
    background: { top: '#f1c9d6', bottom: '#bfe6f8' },
    fog: { color: '#e9bfcd', near: 1400, far: 3200 },
    table: {
      color: '#eeb4c8',
      roughness: 0.25,
      metalness: 0,
      kind: 'playmat',
      insetColor: '#a3d2ee',
      insetRoughness: 0.5,
    },
    tableEdge: '#d97a9c',
    room: { wall: '#ebbfcf', wallBottom: '#c9a0b3', floor: '#c8b49a', trim: '#fff4e0' },
    dominoBody: IVORY_TILES,
    dominoPip: PIP_INK,
    accent: '#ff6b6b',
    ambient: '#ffe9ef',
    hemisphere: { sky: '#ffe3ec', ground: '#9fc9e3' },
    keyLight: { color: '#fff6e0', intensity: 2.2 },
  },
}
