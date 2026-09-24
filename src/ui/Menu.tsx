/*
 * The title screen and level-select menu: play/continue, chapter cards of level tiles, sandbox,
 * how-to-play and settings entry points.
 */
import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { CHAPTERS, LEVELS, levelsInChapter } from '../game/levels/index.ts'
import { chapterProgress, isUnlocked, totalStars } from '../game/rules.ts'
import type { ChapterId, Route, SaveData, Settings } from '../game/types.ts'
import { HowToPlay } from './HowToPlay.tsx'
import { SettingsDialog } from './Settings.tsx'
import { LockIcon, StarIcon } from './icons.tsx'

export interface MenuProps {
  save: SaveData
  onNavigate: (route: Route) => void
  onSettingsChange: (patch: Partial<Settings>) => void
  onResetProgress: () => void
}

const CHAPTER_SWATCHES: Record<ChapterId, { a: string; b: string }> = {
  desk: { a: '#5a3522', b: '#2f5d46' },
  workshop: { a: '#8d949b', b: '#c9a978' },
  playroom: { a: '#f6d6e0', b: '#cfe8f5' },
}

function firstPlayableLevel(save: SaveData): number {
  for (const level of LEVELS) {
    if (isUnlocked(level.id, save) && !save.levels[level.id]?.completed) return level.id
  }
  return LEVELS[0]?.id ?? 1
}

export function Menu({ save, onNavigate, onSettingsChange, onResetProgress }: MenuProps) {
  const [view, setView] = useState<'title' | 'levels'>('title')
  const [showHelp, setShowHelp] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [measuredQuality] = useState<'high' | 'medium' | 'low'>('medium')

  const stars = useMemo(() => totalStars(save), [save])
  const hasProgress = useMemo(() => Object.values(save.levels).some((p) => p.completed), [save])

  if (view === 'levels') {
    return (
      <div className="menu menu--levels">
        <header className="menu__levels-header">
          <button type="button" className="btn btn--ghost" onClick={() => setView('title')}>
            ← Back
          </button>
          <h1>Levels</h1>
          <span className="menu__total-stars">
            <StarIcon size={20} /> {stars}
          </span>
        </header>
        <div className="menu__chapters">
          {CHAPTERS.map((chapter) => {
            const progress = chapterProgress(chapter.id, save)
            const swatch = CHAPTER_SWATCHES[chapter.id]
            return (
              <section
                key={chapter.id}
                className="chapter-card"
                style={{ '--swatch-a': swatch.a, '--swatch-b': swatch.b } as CSSProperties}
              >
                <div className="chapter-card__header">
                  <h2>{chapter.name}</h2>
                  <span className="chapter-card__stars">
                    <StarIcon size={16} /> {progress.stars} / {progress.max}
                  </span>
                </div>
                <p className="chapter-card__tagline">{chapter.tagline}</p>
                <div className="chapter-card__grid">
                  {levelsInChapter(chapter.id).map((level) => {
                    const unlocked = isUnlocked(level.id, save)
                    const levelStars = save.levels[level.id]?.stars ?? 0
                    return (
                      <button
                        key={level.id}
                        type="button"
                        className={`level-tile ${unlocked ? '' : 'level-tile--locked'}`}
                        disabled={!unlocked}
                        onClick={() => onNavigate({ name: 'level', id: level.id })}
                        aria-label={`${level.name}${unlocked ? `, ${levelStars} of 3 stars` : ', locked'}`}
                      >
                        {unlocked ? (
                          <>
                            <span className="level-tile__number">{level.id}</span>
                            <span className="level-tile__name">{level.name}</span>
                            <span className="level-tile__stars">
                              {[0, 1, 2].map((i) => (
                                <StarIcon key={i} size={12} filled={i < levelStars} />
                              ))}
                            </span>
                          </>
                        ) : (
                          <LockIcon size={22} />
                        )}
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
        {showHelp && <HowToPlay onClose={() => setShowHelp(false)} />}
        {showSettings && (
          <SettingsDialog
            settings={save.settings}
            measuredQuality={measuredQuality}
            onChange={onSettingsChange}
            onClose={() => setShowSettings(false)}
            onResetProgress={onResetProgress}
          />
        )}
      </div>
    )
  }

  return (
    <div className="menu menu--title">
      <div className="menu__wordmark" aria-hidden="false">
        <h1 className="menu__logo">
          Domino <span>Topple</span>
        </h1>
        <div className="menu__logo-dominoes" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="menu__logo-domino" style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
      </div>
      <nav className="menu__actions">
        <button type="button" className="btn btn--primary btn--large" onClick={() => onNavigate({ name: 'level', id: firstPlayableLevel(save) })}>
          {hasProgress ? 'Continue' : 'Play'}
        </button>
        <button type="button" className="btn btn--large" onClick={() => setView('levels')}>
          Levels
        </button>
        <button type="button" className="btn btn--large" onClick={() => onNavigate({ name: 'sandbox' })}>
          Sandbox
        </button>
        <button type="button" className="btn btn--large" onClick={() => setShowHelp(true)}>
          How to play
        </button>
        <button type="button" className="btn btn--large" onClick={() => setShowSettings(true)}>
          Settings
        </button>
      </nav>
      <p className="menu__total-stars menu__total-stars--title">
        <StarIcon size={18} /> {stars} stars collected
      </p>
      {showHelp && <HowToPlay onClose={() => setShowHelp(false)} />}
      {showSettings && (
        <SettingsDialog
          settings={save.settings}
          measuredQuality={measuredQuality}
          onChange={onSettingsChange}
          onClose={() => setShowSettings(false)}
          onResetProgress={onResetProgress}
        />
      )}
    </div>
  )
}
