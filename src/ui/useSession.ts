/*
 * Session state for one level (or the sandbox): the editor reducer, the play-mode machine
 * (build / run / result) and run bookkeeping. Layouts live only for the session: a reload or a
 * level change starts the table empty. Pure UI glue: no rendering.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { editorReducer, initialEditor } from '../game/editor.ts'
import { mergeProgress, starsFor } from '../game/rules.ts'
import type { EditorAction, LevelDef, LevelProgress, RunResult, SaveData, Vec3 } from '../game/types.ts'
import type { PlayMode, RunEvent } from '../scene/sceneApi.ts'

export interface SessionResult {
  run: RunResult
  stars: number
  placedCount: number
}

export interface Session {
  mode: PlayMode
  editor: ReturnType<typeof initialEditor>
  dispatch: (action: EditorAction) => void
  runKey: number
  slowMo: boolean
  result: SessionResult | null
  goalBurst: { position: Vec3; key: number } | null
  go: () => void
  stop: () => void
  backToBuild: () => void
  toggleSlowMo: () => void
  onRunEvent: (event: RunEvent) => void
  onRunEnd: (run: RunResult) => void
}

export function useSession(
  level: LevelDef,
  save: SaveData,
  onProgress: (levelId: number, progress: LevelProgress) => void,
): Session {
  const [editor, dispatch] = useReducer(
    (state: ReturnType<typeof initialEditor>, action: EditorAction) => editorReducer(level, state, action),
    undefined,
    () => initialEditor(),
  )
  const [mode, setMode] = useState<PlayMode>('build')
  const [runKey, setRunKey] = useState(0)
  const [slowMo, setSlowMo] = useState(false)
  const [result, setResult] = useState<SessionResult | null>(null)
  const [goalBurst, setGoalBurst] = useState<{ position: Vec3; key: number } | null>(null)
  const burstKey = useRef(0)
  const levelIdRef = useRef(level.id)

  // Reset the whole session when the level changes.
  useEffect(() => {
    if (levelIdRef.current === level.id) return
    levelIdRef.current = level.id
    dispatch({ type: 'reset', placed: [] })
    setMode('build')
    setRunKey(0)
    setSlowMo(false)
    setResult(null)
    setGoalBurst(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level.id])

  // Starts a run from build mode, or replays the same layout from the result card.
  const go = useCallback(() => {
    if (mode === 'run') return
    dispatch({ type: 'selectTool', kind: null })
    setResult(null)
    setGoalBurst(null)
    setSlowMo(false)
    setMode('run')
    setRunKey((k) => k + 1)
  }, [mode])

  const stop = useCallback(() => {
    setMode('build')
  }, [])

  const backToBuild = useCallback(() => {
    setMode('build')
  }, [])

  const toggleSlowMo = useCallback(() => {
    setSlowMo((s) => !s)
  }, [])

  const onRunEvent = useCallback((event: RunEvent) => {
    if (event.type === 'goal') {
      burstKey.current += 1
      setGoalBurst({ position: event.position, key: burstKey.current })
    }
  }, [])

  const onRunEnd = useCallback(
    (run: RunResult) => {
      const placedCount = editor.placed.length
      const stars = starsFor(level, run, placedCount)
      setResult({ run, stars, placedCount })
      setMode('result')
      if (run.outcome === 'success' && level.id !== 0) {
        onProgress(level.id, mergeProgress(save.levels[level.id], stars, placedCount, true))
      }
    },
    [editor.placed.length, level, onProgress, save],
  )

  return useMemo(
    () => ({
      mode,
      editor,
      dispatch,
      runKey,
      slowMo,
      result,
      goalBurst,
      go,
      stop,
      backToBuild,
      toggleSlowMo,
      onRunEvent,
      onRunEnd,
    }),
    [mode, editor, runKey, slowMo, result, goalBurst, go, stop, backToBuild, toggleSlowMo, onRunEvent, onRunEnd],
  )
}
