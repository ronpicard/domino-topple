/*
 * First-visit coach mark on level 1. The status line and the Start / Goal tags already explain how
 * to lay a row, so this only steps in once a few dominoes are down, to point at GO. It finishes when
 * the player presses GO, or with its Skip button.
 */
import { useEffect } from 'react'
import type { EditorState } from '../game/types.ts'
import type { PlayMode } from '../scene/sceneApi.ts'

export interface CoachMarkProps {
  editor: EditorState
  mode: PlayMode
  onDone: () => void
  onSkip: () => void
}

/** Pieces on the table before the coach mark points at GO. */
const PIECES_BEFORE_GO = 3

export function CoachMark({ editor, mode, onDone, onSkip }: CoachMarkProps) {
  const ready = editor.placed.length >= PIECES_BEFORE_GO

  useEffect(() => {
    if (ready && mode !== 'build') onDone()
  }, [ready, mode, onDone])

  if (!ready) return null

  return (
    <div className="coach-mark coach-mark--coach--go" role="status">
      <div className="coach-mark__bubble">
        <span>Finish the row to the Goal, then press GO</span>
        <button type="button" className="coach-mark__skip" onClick={onSkip}>
          Skip
        </button>
      </div>
    </div>
  )
}
