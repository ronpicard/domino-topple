/*
 * First-visit coach marks on level 1: three steps that advance themselves as the player follows
 * along (pick a tool, place a few pieces, press GO), with a Skip button.
 */
import { useEffect, useState } from 'react'
import type { EditorState } from '../game/types.ts'
import type { PlayMode } from '../scene/sceneApi.ts'

export interface CoachMarkProps {
  editor: EditorState
  mode: PlayMode
  onDone: () => void
  onSkip: () => void
}

const STEPS = [
  { anchor: 'coach--tray', text: 'Pick the domino' },
  { anchor: 'coach--table', text: 'Drag across the felt to lay a row' },
  { anchor: 'coach--go', text: 'Press GO' },
] as const

export function CoachMark({ editor, mode, onDone, onSkip }: CoachMarkProps) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (step === 0 && editor.tool) setStep(1)
    else if (step === 1 && editor.placed.length >= 3) setStep(2)
  }, [step, editor.tool, editor.placed.length])

  useEffect(() => {
    if (step === 2 && mode !== 'build') onDone()
  }, [step, mode, onDone])

  const current = STEPS[step]

  return (
    <div className={`coach-mark coach-mark--${current.anchor}`} role="status">
      <div className="coach-mark__bubble">
        <span>{current.text}</span>
        <button type="button" className="coach-mark__skip" onClick={onSkip}>
          Skip
        </button>
      </div>
    </div>
  )
}
