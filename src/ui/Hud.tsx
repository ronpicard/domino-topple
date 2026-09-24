/*
 * The HUD: top bar, camera toolbar, status line, piece dock and the GO / STOP control. Pure
 * presentation over the editor state; all mutation goes through `dispatch` or the session
 * callbacks passed in.
 */
import { PLACEABLE_KINDS, PIECES } from '../game/pieces.ts'
import { remaining } from '../game/placement.ts'
import type { EditorAction, EditorState, LevelDef } from '../game/types.ts'
import { TRAY_DROP_ATTR } from '../scene/sceneApi.ts'
import type { CameraCommand, PlayMode } from '../scene/sceneApi.ts'
import { statusHint } from './statusHint.ts'
import {
  ClearAllIcon,
  GearIcon,
  HandIcon,
  OrbitLeftIcon,
  OrbitRightIcon,
  PIECE_ICONS,
  PlayIcon,
  RedoIcon,
  ResetViewIcon,
  RotateLeftIcon,
  RotateRightIcon,
  SoundOffIcon,
  SoundOnIcon,
  StarIcon,
  StopIcon,
  TopViewIcon,
  UndoIcon,
  BackArrowIcon,
  QuestionIcon,
  ZoomInIcon,
  ZoomOutIcon,
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
  onCamera: (kind: CameraCommand['kind']) => void
  topView: boolean
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
  onCamera,
  topView,
  go,
  stop,
  slowMo,
  onToggleSlowMo,
}: HudProps) {
  const trayKinds = PLACEABLE_KINDS.filter((kind) => (level.inventory[kind] ?? 0) !== 0)
  const building = mode === 'build'
  const hint = statusHint(level, editor, mode, slowMo)

  return (
    <div className="hud">
      <div className="hud__top">
        <div className="chip hud__title-chip">
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
                  <StarIcon key={i} size={12} filled={i < bestStars} />
                ))}
              </span>
            )}
          </div>
        </div>
        <div className="chip hud__actions-chip">
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
      </div>

      {mode !== 'result' && (
        <div className="hud__camera" role="toolbar" aria-label="Camera">
          <button
            type="button"
            className="hud__cam-btn"
            onClick={() => onCamera('orbitLeft')}
            aria-label="Turn view left"
          >
            <OrbitLeftIcon />
          </button>
          <button
            type="button"
            className="hud__cam-btn"
            onClick={() => onCamera('orbitRight')}
            aria-label="Turn view right"
          >
            <OrbitRightIcon />
          </button>
          <button
            type="button"
            className="hud__cam-btn hud__cam-btn--zoom"
            onClick={() => onCamera('zoomIn')}
            aria-label="Zoom in"
          >
            <ZoomInIcon />
          </button>
          <button
            type="button"
            className="hud__cam-btn hud__cam-btn--zoom"
            onClick={() => onCamera('zoomOut')}
            aria-label="Zoom out"
          >
            <ZoomOutIcon />
          </button>
          <button
            type="button"
            className="hud__cam-btn"
            onClick={() => onCamera('toggleTop')}
            aria-label="Top view"
            aria-pressed={topView}
          >
            <TopViewIcon />
          </button>
          <button type="button" className="hud__cam-btn" onClick={onResetView} aria-label="Reset view">
            <ResetViewIcon />
          </button>
        </div>
      )}

      {hint && (
        <p className="hud__status" aria-live="polite">
          {hint}
        </p>
      )}

      {mode !== 'result' && (
        <div className="dock">
          {building ? (
            <>
              <div className="dock__pieces" role="toolbar" aria-label="Pieces" {...{ [TRAY_DROP_ATTR]: 'true' }}>
                <button
                  type="button"
                  className="dock__piece"
                  aria-pressed={editor.tool === null}
                  onClick={() => dispatch({ type: 'selectTool', kind: null })}
                >
                  <HandIcon size={28} />
                  <span className="dock__piece-label">Hand</span>
                </button>
                {trayKinds.map((kind) => {
                  const Icon = PIECE_ICONS[kind]
                  const count = remaining(level, editor.placed, kind)
                  const disabled = count <= 0
                  const active = editor.tool === kind
                  const unlimited = count === Infinity
                  const countLabel = unlimited ? '∞' : `${count} left`
                  return (
                    <button
                      key={kind}
                      type="button"
                      className="dock__piece"
                      disabled={disabled}
                      aria-pressed={active}
                      aria-label={`${PIECES[kind].label}, ${unlimited ? 'unlimited' : countLabel}`}
                      title={PIECES[kind].blurb}
                      onClick={() => dispatch({ type: 'selectTool', kind: active ? null : kind })}
                    >
                      <Icon size={28} />
                      <span className="dock__piece-label">{PIECES[kind].label}</span>
                      <span className={`dock__count${count === 0 ? ' dock__count--empty' : ''}`}>{countLabel}</span>
                    </button>
                  )
                })}
              </div>
              <div className="dock__divider" />
              <div className="dock__edit" role="toolbar" aria-label="Edit">
                <button
                  type="button"
                  className="dock__btn"
                  onClick={() => dispatch({ type: 'rotate', steps: -1 })}
                  title="Turn left"
                  aria-label="Turn left"
                >
                  <RotateLeftIcon />
                  <span className="dock__btn-label">Turn</span>
                </button>
                <button
                  type="button"
                  className="dock__btn"
                  onClick={() => dispatch({ type: 'rotate', steps: 1 })}
                  title="Turn right"
                  aria-label="Turn right"
                >
                  <RotateRightIcon />
                  <span className="dock__btn-label">Turn</span>
                </button>
                <button
                  type="button"
                  className="dock__btn"
                  onClick={() => dispatch({ type: 'undo' })}
                  disabled={editor.past.length === 0}
                  title="Undo"
                  aria-label="Undo"
                >
                  <UndoIcon />
                  <span className="dock__btn-label">Undo</span>
                </button>
                <button
                  type="button"
                  className="dock__btn"
                  onClick={() => dispatch({ type: 'redo' })}
                  disabled={editor.future.length === 0}
                  title="Redo"
                  aria-label="Redo"
                >
                  <RedoIcon />
                  <span className="dock__btn-label">Redo</span>
                </button>
                <button
                  type="button"
                  className="dock__btn"
                  onClick={() => {
                    if (editor.placed.length === 0) return
                    dispatch({ type: 'clearAll' })
                  }}
                  disabled={editor.placed.length === 0}
                  title="Clear all pieces"
                  aria-label="Clear all pieces"
                >
                  <ClearAllIcon />
                  <span className="dock__btn-label">Clear</span>
                </button>
              </div>
              <div
                className="dock__meta"
                aria-label={`Pieces ${editor.placed.length}${level.parPieces > 0 ? `, par ${level.parPieces}` : ''}`}
              >
                <span className="dock__meta-count">{editor.placed.length}</span>
                {level.parPieces > 0 && <span className="dock__meta-par">par {level.parPieces}</span>}
              </div>
              <button type="button" className="dock__go" onClick={go} aria-label="Press GO to run the chain reaction">
                <PlayIcon /> GO
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="dock__btn dock__slowmo"
                onClick={onToggleSlowMo}
                aria-pressed={slowMo}
              >
                ½×
                <span className="dock__btn-label">Slow-mo</span>
              </button>
              <span className="dock__running">Running…</span>
              <button type="button" className="dock__go dock__go--stop" onClick={stop} aria-label="Stop the run">
                <StopIcon /> STOP
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
