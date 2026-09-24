/*
 * The in-level screen: the 3D canvas, HUD, dialogs, toasts and keyboard shortcuts. Owns the
 * session (build / run / result) via useSession and wires it to the scene.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { PLACEABLE_KINDS } from '../game/pieces.ts'
import { nextLevelId } from '../game/rules.ts'
import { formatRoute } from '../game/routes.ts'
import type { LevelDef, LevelProgress, QualityTier, SaveData, Settings } from '../game/types.ts'
import { GameCanvas } from '../scene/GameCanvas.tsx'
import { CoachMark } from './CoachMark.tsx'
import { Hud } from './Hud.tsx'
import { HowToPlay } from './HowToPlay.tsx'
import { ResultCard } from './ResultCard.tsx'
import { SettingsDialog } from './Settings.tsx'
import { Toast } from './Toast.tsx'
import { useSession } from './useSession.ts'

export interface PlayScreenProps {
  level: LevelDef
  save: SaveData
  onProgress: (levelId: number, progress: LevelProgress) => void
  onSeenCoach: () => void
  onSettingsChange: (patch: Partial<Settings>) => void
  onExit: () => void
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

export function PlayScreen({ level, save, onProgress, onSeenCoach, onSettingsChange, onExit }: PlayScreenProps) {
  const session = useSession(level, save, onProgress)
  const { mode, editor, dispatch, runKey, slowMo, result, go, stop, backToBuild, toggleSlowMo, onRunEvent, onRunEnd } =
    session

  const [measuredQuality, setMeasuredQuality] = useState<QualityTier>('medium')
  const [cameraResetKey, setCameraResetKey] = useState(0)
  const [showHelp, setShowHelp] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showToast, setShowToast] = useState(true)
  const dialogOpen = showHelp || showSettings

  const quality: QualityTier = save.settings.quality === 'auto' ? measuredQuality : save.settings.quality

  // Reset transient UI when the level changes.
  useEffect(() => {
    setShowToast(true)
    setShowHelp(false)
    setShowSettings(false)
  }, [level.id])

  const placedCountRef = useRef(editor.placed.length)
  placedCountRef.current = editor.placed.length

  const resetView = useCallback(() => setCameraResetKey((k) => k + 1), [])

  const remaining = useCallback(
    (kind: (typeof PLACEABLE_KINDS)[number]) => level.inventory[kind] ?? 0,
    [level],
  )

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return
      if (dialogOpen) {
        if (e.key === 'Escape') {
          setShowHelp(false)
          setShowSettings(false)
        }
        return
      }
      const mod = e.ctrlKey || e.metaKey
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' })
        return
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault()
        dispatch({ type: 'redo' })
        return
      }
      if (mode !== 'build') {
        if (e.key === ' ') {
          e.preventDefault()
          if (mode === 'run') stop()
          else backToBuild()
        } else if (e.key === 's' || e.key === 'S') {
          toggleSlowMo()
        } else if (e.key === 'c' || e.key === 'C') {
          resetView()
        } else if (e.key === 'h' || e.key === 'H') {
          setShowHelp(true)
        } else if (e.key === 'Escape') {
          backToBuild()
        }
        return
      }
      if (e.key >= '1' && e.key <= '8') {
        const idx = Number(e.key) - 1
        const available = PLACEABLE_KINDS.filter((k) => remaining(k) !== 0)
        const kind = available[idx]
        if (kind) {
          dispatch({ type: 'selectTool', kind })
          if (!editor.ghost) dispatch({ type: 'hover', x: level.camera.target[0], z: level.camera.target[2] })
        }
        return
      }
      switch (e.key) {
        case '0':
        case 'Escape':
          if (editor.tool) dispatch({ type: 'selectTool', kind: null })
          else if (editor.selectedId) dispatch({ type: 'select', id: null })
          break
        case 'ArrowLeft':
          e.preventDefault()
          dispatch({ type: 'nudge', dx: -1, dz: 0 })
          break
        case 'ArrowRight':
          e.preventDefault()
          dispatch({ type: 'nudge', dx: 1, dz: 0 })
          break
        case 'ArrowUp':
          e.preventDefault()
          dispatch({ type: 'nudge', dx: 0, dz: -1 })
          break
        case 'ArrowDown':
          e.preventDefault()
          dispatch({ type: 'nudge', dx: 0, dz: 1 })
          break
        case 'Enter':
          dispatch({ type: 'placeAtGhost' })
          break
        case 'q':
        case 'Q':
          dispatch({ type: 'rotate', steps: -1 })
          break
        case 'e':
        case 'E':
          dispatch({ type: 'rotate', steps: 1 })
          break
        case 'r':
        case 'R':
          dispatch({ type: 'rotate', steps: 6 })
          break
        case 'Delete':
        case 'Backspace':
          dispatch({ type: 'removeSelected' })
          break
        case ' ':
          e.preventDefault()
          go()
          break
        case 's':
        case 'S':
          toggleSlowMo()
          break
        case 'c':
        case 'C':
          resetView()
          break
        case 'h':
        case 'H':
          setShowHelp(true)
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dialogOpen, dispatch, editor.tool, editor.selectedId, editor.ghost, level, mode, go, stop, backToBuild, toggleSlowMo, resetView, remaining])

  const bestStars = save.levels[level.id]?.stars ?? 0
  const showCoach = level.id === 1 && !save.seenCoach && mode === 'build'

  const goToNextLevel = useCallback(() => {
    const nextId = level.id === 0 ? null : nextLevelId(level.id)
    if (nextId === null) {
      onExit()
      return
    }
    window.location.hash = formatRoute({ name: 'level', id: nextId })
  }, [level.id, onExit])

  return (
    <div className="play-screen">
      <GameCanvas
        level={level}
        chapter={level.chapter}
        mode={mode}
        editor={editor}
        dispatch={dispatch}
        runKey={runKey}
        slowMo={slowMo}
        quality={quality}
        reducedMotion={save.settings.reducedMotion}
        cameraResetKey={cameraResetKey}
        onRunEvent={onRunEvent}
        onRunEnd={onRunEnd}
        onQualityMeasured={setMeasuredQuality}
      />
      <Hud
        level={level}
        editor={editor}
        dispatch={dispatch}
        mode={mode}
        bestStars={bestStars}
        muted={save.settings.muted}
        onToggleMute={() => onSettingsChange({ muted: !save.settings.muted })}
        onOpenSettings={() => setShowSettings(true)}
        onOpenHelp={() => setShowHelp(true)}
        onBackToMenu={onExit}
        onResetView={resetView}
        go={go}
        stop={stop}
        slowMo={slowMo}
        onToggleSlowMo={toggleSlowMo}
      />
      {showToast && level.hint && mode === 'build' && (
        <Toast message={level.hint} onDismiss={() => setShowToast(false)} />
      )}
      {showCoach && <CoachMark editor={editor} mode={mode} onDone={onSeenCoach} onSkip={onSeenCoach} />}
      {result && mode === 'result' && (
        <ResultCard
          level={level}
          result={result}
          isSandbox={level.id === 0}
          reducedMotion={save.settings.reducedMotion}
          onNext={goToNextLevel}
          onImprove={backToBuild}
          onMenu={onExit}
          onBackToBuild={backToBuild}
          onWatchAgain={go}
        />
      )}
      {showHelp && <HowToPlay onClose={() => setShowHelp(false)} />}
      {showSettings && (
        <SettingsDialog
          settings={save.settings}
          measuredQuality={measuredQuality}
          onChange={onSettingsChange}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
