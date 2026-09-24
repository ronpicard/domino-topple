/*
 * The end-of-run overlay: success (stars, next steps) or fail (hint, retry). A modal dialog that
 * focuses its primary action and closes to build mode on Escape.
 */
import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio.ts'
import type { LevelDef } from '../game/types.ts'
import type { SessionResult } from './useSession.ts'
import { StarIcon } from './icons.tsx'

export interface ResultCardProps {
  level: LevelDef
  result: SessionResult
  isSandbox: boolean
  reducedMotion: boolean
  onNext: () => void
  onImprove: () => void
  onMenu: () => void
  onBackToBuild: () => void
  onWatchAgain: () => void
}

export function ResultCard({
  level,
  result,
  isSandbox,
  reducedMotion,
  onNext,
  onImprove,
  onMenu,
  onBackToBuild,
  onWatchAgain,
}: ResultCardProps) {
  const success = result.run.outcome === 'success'
  const primaryRef = useRef<HTMLButtonElement>(null)
  const [shownStars, setShownStars] = useState(reducedMotion ? result.stars : 0)

  useEffect(() => {
    primaryRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!success || reducedMotion) return
    if (result.stars === 0) return
    let i = 0
    const timer = window.setInterval(() => {
      i += 1
      setShownStars(i)
      audio.star()
      if (i >= result.stars) window.clearInterval(timer)
    }, 320)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [success, reducedMotion, result.stars])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onBackToBuild()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onBackToBuild])

  const hasStarFixture = level.fixtures.some((f) => f.kind === 'star')

  return (
    <div className="dialog-overlay">
      <div className="dialog result-card" role="dialog" aria-modal="true" aria-labelledby="result-title">
        {isSandbox ? (
          <>
            <h2 id="result-title">{success ? 'Goal!' : 'Not quite!'}</h2>
            <p className="result-card__body">
              {success ? 'The chain reaction reached the goal.' : 'The run settled without reaching the goal.'}
            </p>
            <div className="dialog__actions">
              <button type="button" className="btn btn--primary" ref={primaryRef} onClick={onBackToBuild}>
                Back to build
              </button>
            </div>
          </>
        ) : success ? (
          <>
            <h2 id="result-title">Level complete!</h2>
            <div className="result-card__stars" aria-label={`${shownStars} of 3 stars`}>
              {[0, 1, 2].map((i) => (
                <span key={i} className={i < shownStars ? 'result-card__star-pop' : ''}>
                  <StarIcon size={40} filled={i < shownStars} />
                </span>
              ))}
            </div>
            <p className="result-card__body">
              Pieces used {result.placedCount} (par {level.parPieces})
            </p>
            {hasStarFixture && (
              <p className="result-card__body">Star token {result.run.starCollected ? '✓' : '✗'}</p>
            )}
            <div className="dialog__actions">
              <button type="button" className="btn btn--primary" ref={primaryRef} onClick={onNext}>
                Next level
              </button>
              <button type="button" className="btn" onClick={onImprove}>
                Improve layout
              </button>
              <button type="button" className="btn btn--ghost" onClick={onMenu}>
                Menu
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="result-title">Not quite!</h2>
            <p className="result-card__body">{level.hint}</p>
            <div className="dialog__actions">
              <button type="button" className="btn btn--primary" ref={primaryRef} onClick={onBackToBuild}>
                Back to build
              </button>
              <button type="button" className="btn" onClick={onWatchAgain}>
                Watch again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
