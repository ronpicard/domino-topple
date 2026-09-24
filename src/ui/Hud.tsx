/*
 * The HUD: top bar, piece tray, tool bar and the GO / STOP control. Pure presentation over the
 * editor state; all mutation goes through `dispatch` or the session callbacks passed in.
 */
import { PLACEABLE_KINDS, PIECES } from '../game/pieces.ts'
import { remaining } from '../game/placement.ts'
import type { EditorAction, EditorState, LevelDef } from '../game/types.ts'
import { TRAY_DROP_ATTR } from '../scene/sceneApi.ts'
import type { PlayMode } from '../scene/sceneApi.ts'
import {
  GearIcon,
  PIECE_ICONS,
  PlayIcon,
  RedoIcon,
  ResetViewIcon,
  ClearAllIcon,
  RotateLeftIcon,
  RotateRightIcon,
  SoundOffIcon,
  SoundOnIcon,
  StarIcon,
  StopIcon,
  TrashIcon,
  UndoIcon,
  BackArrowIcon,
  QuestionIcon,
} from './icons.tsx'

export interface HudProps {
  level: LevelDef
  editor: EditorState
  dispatch: (action: EditorAction) => void
  mode: PlayMode
  bestStars: number
  muted: boolean
  onToggleMute: () => void
  onOpenSettings: () => void
  onOpenHelp: () => void
  onBackToMenu: () => void
  onResetView: () => void
  go: () => void
  stop: () => void
  slowMo: boolean
  onToggleSlowMo: () => void
}

export function Hud({
  level,
  editor,
  dispatch,
  mode,
  bestStars,
  muted,
  onToggleMute,
  onOpenSettings,
  onOpenHelp,
  onBackToMenu,
  onResetView,
  go,
  stop,
  slowMo,
  onToggleSlowMo,
}: HudProps) {
  const trayKinds = PLACEABLE_KINDS.filter((kind) => (level.inventory[kind] ?? 0) !== 0)
  const building = mode === 'build'

  return (
    <div className="hud">
      <header className="hud__topbar">
        <button type="button" className="hud__icon-btn" onClick={onBackToMenu} aria-label="Back to menu">
          <BackArrowIcon />
        </button>
        <div className="hud__title">
          <span className="hud__level-name">
            {level.id === 0 ? 'Sandbox' : `${level.id}. ${level.name}`}
          </span>
          {level.id !== 0 && (
            <span className="hud__level-stars" aria-label={`Best score: ${bestStars} of 3 stars`}>
              {[0, 1, 2].map((i) => (
                <StarIcon key={i} size={14} filled={i < bestStars} />
              ))}
            </span>
          )}
        </div>
        <div className="hud__topbar-actions">
          <button type="button" className="hud__icon-btn" onClick={onToggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? <SoundOffIcon /> : <SoundOnIcon />}
          </button>
          <button type="button" className="hud__icon-btn" onClick={onOpenSettings} aria-label="Settings">
            <GearIcon />
          </button>
          <button type="button" className="hud__icon-btn" onClick={onOpenHelp} aria-label="How to play">
            <QuestionIcon />
          </button>
        </div>
      </header>

      {building && (
        <nav className="tray" aria-label="Pieces" {...{ [TRAY_DROP_ATTR]: 'true' }}>
          {trayKinds.map((kind) => {
            const Icon = PIECE_ICONS[kind]
            const count = remaining(level, editor.placed, kind)
            const disabled = count <= 0
            const active = editor.tool === kind
            return (
              <button
                key={kind}
                type="button"
                className="tray__item"
                disabled={disabled}
                aria-pressed={active}
                aria-label={`${PIECES[kind].label}: ${count === Infinity ? 'unlimited' : count} left`}
                title={PIECES[kind].blurb}
                onClick={() => dispatch({ type: 'selectTool', kind: active ? null : kind })}
              >
                <Icon size={26} />
                <span className="tray__label">{PIECES[kind].label}</span>
                <span className="tray__count">{count === Infinity ? '∞' : `×${count}`}</span>
              </button>
            )
          })}
        </nav>
      )}

      {mode !== 'result' && (
      <div className="hud__bottombar">
        {building ? (
          <div className="hud__tools" role="toolbar" aria-label="Build tools">
            <button
              type="button"
              className="hud__icon-btn"
              onClick={() => dispatch({ type: 'rotate', steps: -1 })}
              title="Rotate left"
              aria-label="Rotate left"
            >
              <RotateLeftIcon />
              <span className="hud__icon-label">Rotate</span>
            </button>
            <button
              type="button"
              className="hud__icon-btn"
              onClick={() => dispatch({ type: 'rotate', steps: 1 })}
              title="Rotate right"
              aria-label="Rotate right"
            >
              <RotateRightIcon />
              <span className="hud__icon-label">Rotate</span>
            </button>
            <button
              type="button"
              className="hud__icon-btn"
              onClick={() => dispatch({ type: 'removeSelected' })}
              disabled={!editor.selectedId}
              title="Delete selected piece"
              aria-label="Delete selected piece"
            >
              <TrashIcon />
              <span className="hud__icon-label">Delete</span>
            </button>
            <button
              type="button"
              className="hud__icon-btn"
              onClick={() => dispatch({ type: 'undo' })}
              disabled={editor.past.length === 0}
              title="Undo"
              aria-label="Undo"
            >
              <UndoIcon />
              <span className="hud__icon-label">Undo</span>
            </button>
            <button
              type="button"
              className="hud__icon-btn"
              onClick={() => dispatch({ type: 'redo' })}
              disabled={editor.future.length === 0}
              title="Redo"
              aria-label="Redo"
            >
              <RedoIcon />
              <span className="hud__icon-label">Redo</span>
            </button>
            <button
              type="button"
              className="hud__icon-btn"
              onClick={() => {
                if (editor.placed.length === 0) return
                if (window.confirm('Clear all placed pieces?')) dispatch({ type: 'clearAll' })
              }}
              disabled={editor.placed.length === 0}
              title="Clear all pieces"
              aria-label="Clear all pieces"
            >
              <ClearAllIcon />
              <span className="hud__icon-label">Clear</span>
            </button>
            <button type="button" className="hud__icon-btn" onClick={onResetView} title="Reset camera view"
              aria-label="Reset camera view">
              <ResetViewIcon />
              <span className="hud__icon-label">View</span>
            </button>
            <span className="hud__piece-counter" aria-label={`Pieces ${editor.placed.length}${level.parPieces > 0 ? ` of par ${level.parPieces}` : ''}`}>
              <span className="hud__counter-long">Pieces </span>
              {editor.placed.length}
              {level.parPieces > 0 && (
                <>
                  <span className="hud__counter-long"> / par </span>
                  <span className="hud__counter-short">/</span>
                  {level.parPieces}
                </>
              )}
            </span>
          </div>
        ) : (
          <div className="hud__tools" role="toolbar" aria-label="Run controls">
            <button
              type="button"
              className={`hud__slowmo ${slowMo ? 'hud__slowmo--active' : ''}`}
              onClick={onToggleSlowMo}
              aria-pressed={slowMo}
            >
              ½×
            </button>
          </div>
        )}

        {building ? (
          <button type="button" className="hud__go" onClick={go} aria-label="Press GO to run the chain reaction">
            <PlayIcon /> GO
          </button>
        ) : (
          <button type="button" className="hud__go hud__go--stop" onClick={stop} aria-label="Stop the run">
            <StopIcon /> STOP
          </button>
        )}
      </div>
      )}
    </div>
  )
}
