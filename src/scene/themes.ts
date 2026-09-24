/*
 * Chapter visual themes: the colour palette, table dressing and lighting that give each of Domino
 * Topple's three chapters (desk / workshop / playroom) a distinct, warm toy-diorama look. Consumed
 * by materials.ts (part materials), Diorama.tsx (table + lighting, built elsewhere) and PiecesView.
 */

import type { ChapterId } from '../game/types.ts'

export interface ChapterTheme {
  /** Vertical gradient behind the diorama, top of sky to horizon. */
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
  /** One colour (desk/workshop) or a palette cycled by instance index (playroom candy dominoes). */
  dominoBody: string[]
  dominoPip: string
  accent: string
  ambient: string
  hemisphere: { sky: string; ground: string }
  keyLight: { color: string; intensity: number }
}

export const THEMES: Record<ChapterId, ChapterTheme> = {
  desk: {
    background: { top: '#3c2c1f', bottom: '#100c08' },
    fog: { color: '#180f0a', near: 600, far: 1500 },
    table: {
      color: '#5a3522',
      roughness: 0.35,
      metalness: 0.05,
      kind: 'feltInset',
      insetColor: '#2f5d46',
      insetRoughness: 0.95,
    },
    tableEdge: '#3a2013',
    dominoBody: ['#f4ecd8'],
    dominoPip: '#1c1712',
    accent: '#e8590c',
    ambient: '#4a3a2c',
    hemisphere: { sky: '#b9a58c', ground: '#3a291c' },
    keyLight: { color: '#ffe2b8', intensity: 2.6 },
  },
  workshop: {
    background: { top: '#33383d', bottom: '#0c0d0f' },
    fog: { color: '#14161a', near: 600, far: 1500 },
    table: {
      color: '#8d949b',
      roughness: 0.45,
      metalness: 0.8,
      kind: 'metalBench',
      insetColor: '#c9a978',
      insetRoughness: 0.85,
    },
    tableEdge: '#4c5157',
    dominoBody: ['#22252a'],
    dominoPip: '#f2f2f2',
    accent: '#e8590c',
    ambient: '#3c4247',
    hemisphere: { sky: '#c3cbd3', ground: '#34383d' },
    keyLight: { color: '#eef3ff', intensity: 2.2 },
  },
  playroom: {
    background: { top: '#ffd9e6', bottom: '#bfe6f8' },
    fog: { color: '#fbe8f1', near: 600, far: 1500 },
    table: {
      color: '#eeb4c8',
      roughness: 0.25,
      metalness: 0,
      kind: 'playmat',
      insetColor: '#a3d2ee',
      insetRoughness: 0.5,
    },
    tableEdge: '#d97a9c',
    dominoBody: ['#ff6b6b', '#ffb84d', '#ffe066', '#6bd66b', '#4dabf7', '#b197fc'],
    dominoPip: '#ffffff',
    accent: '#e8590c',
    ambient: '#ffe9ef',
    hemisphere: { sky: '#ffe3ec', ground: '#9fc9e3' },
    keyLight: { color: '#fff6e0', intensity: 2.4 },
  },
}
