/* The "How to play" dialog: steps, keyboard shortcuts and touch gestures. */
import { useEffect, useRef } from 'react'

export interface HowToPlayProps {
  onClose: () => void
}

const STEPS = [
  'Pick a piece from the tray.',
  'Tap to place one, or drag across the table to lay a row.',
  'Tap a placed piece to select it: rotate, move or remove it.',
  'Press GO and watch the chain reaction.',
  'Reach the goal for a star. Stay under par pieces and grab the star token for two more.',
]

const SHORTCUTS: [string, string][] = [
  ['1-8', 'Select a tray piece'],
  ['0 / Esc', 'Deselect tool or piece'],
  ['Arrows', 'Nudge ghost or selection'],
  ['Enter', 'Place at ghost'],
  ['Q / E', 'Rotate -15° / +15°'],
  ['R', 'Rotate 90°'],
  ['Delete', 'Remove selected'],
  ['Ctrl/Cmd+Z', 'Undo'],
  ['Ctrl/Cmd+Shift+Z', 'Redo'],
  ['Space', 'GO / Stop'],
  ['S', 'Slow motion'],
  ['C', 'Reset camera'],
  ['H', 'Help'],
]

const GESTURES = [
  'One-finger drag on the table: orbit the camera.',
  'Two-finger drag: pan the camera.',
  'Pinch: zoom.',
  'Tap a tray piece, then tap or drag on the table to place it.',
  'Drag a placed piece onto the tray to remove it.',
]

export function HowToPlay({ onClose }: HowToPlayProps) {
  const primaryRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    primaryRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="dialog-overlay">
      <div className="dialog how-to-play" role="dialog" aria-modal="true" aria-labelledby="howto-title">
        <h2 id="howto-title">How to play</h2>
        <ol className="how-to-play__steps">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <h3>Keyboard shortcuts</h3>
        <table className="how-to-play__table">
          <tbody>
            {SHORTCUTS.map(([key, desc]) => (
              <tr key={key}>
                <td><kbd>{key}</kbd></td>
                <td>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Touch gestures</h3>
        <ul className="how-to-play__gestures">
          {GESTURES.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
        <div className="dialog__actions">
          <button type="button" className="btn btn--primary" ref={primaryRef} onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
