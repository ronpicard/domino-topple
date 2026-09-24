/*
 * Pure status-line text for the HUD: a single sentence telling the player what to do next,
 * derived from the current mode and editor state. Before the first piece goes down it shows the
 * level's own hint. No React, no side effects.
 */
import { PIECES } from '../game/pieces.ts'
import type { EditorState, LevelDef, PlacementProblem } from '../game/types.ts'
import type { PlayMode } from '../scene/sceneApi.ts'

const GHOST_PROBLEM_TEXT: Record<PlacementProblem, string> = {
  offTable: 'Keep it on the table.',
  overlap: 'Too close to another piece.',
  noSupport: 'It needs flat ground underneath.',
  inventory: 'None of those left.',
  locked: 'That piece is part of the level.',
}

export function statusHint(level: LevelDef, editor: EditorState, mode: PlayMode, slowMo: boolean): string {
  if (mode === 'run') {
    return slowMo ? 'Slow motion. Press STOP to go back and edit.' : 'Running… Press STOP to go back and edit.'
  }
  if (mode === 'result') return ''

  if (editor.ghost && !editor.ghost.valid && editor.ghost.problem) {
    return GHOST_PROBLEM_TEXT[editor.ghost.problem]
  }
  if (editor.selectedId) return 'Drag to move it, or use the buttons above it.'
  if (editor.placed.length === 0 && level.hint) return level.hint
  if (editor.tool === 'domino' || editor.tool === 'tallDomino') {
    return 'Drag across the table to lay a row, or tap to place one.'
  }
  if (editor.tool) {
    return `Tap the table to place a ${PIECES[editor.tool].label.toLowerCase()}. Turn it before placing with ⟲ ⟳.`
  }
  if (editor.placed.length === 0) return 'Pick a piece below to start building.'
  return 'Drag to move the view. Tap a piece to edit it. Press GO when ready.'
}
