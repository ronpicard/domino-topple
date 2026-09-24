/*
 * The in-level screen: the 3D canvas, HUD, dialogs, coach mark and keyboard shortcuts. Owns the
 * session (build / run / result) via useSession and wires it to the scene.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { PLACEABLE_KINDS } from '../game/pieces.ts'
import { remaining as remainingCount } from '../game/placement.ts'
import { nextLevelId } from '../game/rules.ts'
import { formatRoute } from '../game/routes.ts'
import type { LevelDef, LevelProgress, QualityTier, SaveData, Settings } from '../game/types.ts'
import { GameCanvas } from '../scene/GameCanvas.tsx'
import type { CameraCommand, ViewInsets } from '../scene/sceneApi.ts'
import { CoachMark } from './CoachMark.tsx'
import { Hud } from './Hud.tsx'
import { HowToPlay } from './HowToPlay.tsx'
import { ResultCard } from './ResultCard.tsx'
import { SettingsDialog } from './Settings.tsx'
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
  const [cameraCommand, setCameraCommand] = useState<CameraCommand | null>(null)
  const [topView, setTopView] = useState(false)
  const [viewInsets, setViewInsets] = useState<ViewInsets>({ top: 0, right: 0, bottom: 0, left: 0 })
  const [showHelp, setShowHelp] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const dialogOpen = showHelp || showSettings
  const containerRef = useRef<HTMLDivElement>(null)
  const cameraSeqRef = useRef(0)
  const lastBuildKeyRef = useRef<string | null>(null)

  const quality: QualityTier = save.settings.quality === 'auto' ? measuredQuality : save.settings.quality

  // Reset transient UI when the level changes.
  useEffect(() => {
    setShowHelp(false)
    setShowSettings(false)
    setTopView(false)
  }, [level.id])

  const placedCountRef = useRef(editor.placed.length)
  placedCountRef.current = editor.placed.length

  const resetView = useCallback(() => {
    setCameraResetKey((k) => k + 1)
    setTopView(false)
  }, [])

  const onCamera = useCallback((kind: CameraCommand['kind']) => {
    cameraSeqRef.current += 1
    setCameraCommand({ kind, seq: cameraSeqRef.current })
    if (kind === 'toggleTop') setTopView((v) => !v)
  }, [])

  const remaining = useCallback(
    (kind: (typeof PLACEABLE_KINDS)[number]) => level.inventory[kind] ?? 0,
    [level],
  )

  // Auto-select a piece so one is ready in the dock as soon as the level opens.
  // Building is the default: whenever build mode starts (a level opens, or a run ends), the first
  // piece with stock left is ready in the dock, so a drag lays dominoes rather than moving the view.
  const buildKey = mode === 'build' ? `${level.id}:${runKey}` : null
  useEffect(() => {
    if (buildKey === null || lastBuildKeyRef.current === buildKey) return
    lastBuildKeyRef.current = buildKey
    const kind = PLACEABLE_KINDS.find((k) => remainingCount(level, editor.placed, k) > 0)
    if (kind) dispatch({ type: 'selectTool', kind })
  }, [buildKey, level, editor.placed, dispatch])

  // Measure the HUD chrome so the scene camera frames the table clear of it.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function measure() {
      if (!container) return
      const topEl = container.querySelector<HTMLElement>('.hud__top')
      const dockEl = container.querySelector<HTMLElement>('.dock')
      const camEl = container.querySelector<HTMLElement>('.hud__camera')
      const statusEl = container.querySelector<HTMLElement>('.hud__status')

      const top = topEl ? topEl.getBoundingClientRect().bottom : 0
      let bottom = 0
      if (dockEl) {
        bottom = window.innerHeight - dockEl.getBoundingClientRect().top
        if (statusEl) bottom += statusEl.getBoundingClientRect().height
      }
      const wide = window.innerWidth >= 900
      const right = wide && camEl ? camEl.getBoundingClientRect().width + 16 : 0

      setViewInsets((prev) => {
        const next: ViewInsets = { top, right, bottom, left: 0 }
        const changed =
          Math.abs(next.top - prev.top) >= 2 ||
          Math.abs(next.right - prev.right) >= 2 ||
          Math.abs(next.bottom - prev.bottom) >= 2 ||
          Math.abs(next.left - prev.left) >= 2
        return changed ? next : prev
      })
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(container)
    for (const el of [container.querySelector('.hud__top'), container.querySelector('.dock'), container.querySelector('.hud__camera'), container.querySelector('.hud__status')]) {
      if (el) ro.observe(el)
    }
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [mode])

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
      if (mode !== 'result') {
        switch (e.key) {
          case '[':
            onCamera('orbitLeft')
            return
          case ']':
            onCamera('orbitRight')
            return
          case '=':
          case '+':
            onCamera('zoomIn')
            return
          case '-':
            onCamera('zoomOut')
            return
          case 't':
          case 'T':
            onCamera('toggleTop')
            return
          default:
            break
        }
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
        case 'v':
        case 'V':
          dispatch({ type: 'selectTool', kind: null })
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    dialogOpen,
    dispatch,
    editor.tool,
    editor.selectedId,
    editor.ghost,
    level,
    mode,
    go,
    stop,
    backToBuild,
    toggleSlowMo,
    resetView,
    remaining,
    onCamera,
  ])

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
    <div className="play-screen" ref={containerRef}>
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
        cameraCommand={cameraCommand}
        viewInsets={viewInsets}
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
        onCamera={onCamera}
        topView={topView}
        go={go}
        stop={stop}
        slowMo={slowMo}
        onToggleSlowMo={toggleSlowMo}
      />
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
