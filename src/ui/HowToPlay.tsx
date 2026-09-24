/* The "How to play" dialog: steps, keyboard shortcuts and touch gestures. */
import { useEffect, useRef } from 'react'

export interface HowToPlayProps {
  onClose: () => void
}

const STEPS = [
  'A piece is ready in the dock at the bottom. Drag across the table to lay a row of dominoes, or tap to place one.',
  'Pick Hand to move the view, or tap a placed piece to turn, move or remove it.',
  'Build a chain from Start to Goal, then press GO.',
  'One star for reaching the Goal, one for staying within par, one for the ★ Bonus.',
]

const SHORTCUTS: [string, string][] = [
  ['1-8', 'Select a dock piece'],
  ['0 / Esc', 'Deselect tool or piece'],
  ['V', 'Hand tool'],
  ['Arrows', 'Nudge ghost or selection'],
  ['Enter', 'Place at ghost'],
  ['Q / E', 'Rotate -15° / +15°'],
  ['R', 'Rotate 90°'],
  ['Delete', 'Remove selected'],
  ['Ctrl/Cmd+Z', 'Undo'],
  ['Ctrl/Cmd+Shift+Z', 'Redo'],
  ['Space', 'GO / Stop'],
  ['S', 'Slow motion'],
  ['[ / ]', 'Turn the view'],
  ['+ / −', 'Zoom'],
  ['T', 'Top view'],
  ['C', 'Reset camera'],
  ['H', 'Help'],
]

const GESTURES = [
  'Drag with a piece selected: lay it on the table.',
  'Drag with Hand, or with two fingers: slide the view.',
  'Pinch, or use the mouse wheel: zoom. The zoom-out button, held past the table, shows the room.',
  'Turn the view with the ⟲ ⟳ buttons on the right, or the [ and ] keys.',
  'Drag a placed piece onto the dock to remove it.',
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
        <h3>Mouse and touch</h3>
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
