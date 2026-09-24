/*
 * The menu's living backdrop: level 1's reference layout toppling on a silent loop behind the
 * menu panels. Purely decorative, so it takes no input and is hidden from assistive tech.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { initialEditor } from '../game/editor.ts'
import { LEVELS } from '../game/levels/index.ts'
import { settleHeights } from '../game/placement.ts'
import type { QualityTier, Settings } from '../game/types.ts'
import { GameCanvas } from '../scene/GameCanvas.tsx'

/** Pause between the end of one run and the next. */
const REPLAY_DELAY_MS = 2500
const noop = () => {}

function backdropQuality(settings: Settings): QualityTier {
  if (settings.quality !== 'auto') return settings.quality
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  return coarse ? 'low' : 'medium'
}

export function MenuBackdrop({ settings }: { settings: Settings }) {
  const level = LEVELS[0]
  const editor = useMemo(() => initialEditor(level ? settleHeights(level, level.solution) : []), [level])
  const [runKey, setRunKey] = useState(1)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const onRunEnd = useCallback(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setRunKey((k) => k + 1), REPLAY_DELAY_MS)
  }, [])

  if (!level) return null
  return (
    <div className="menu-backdrop" aria-hidden="true">
      <GameCanvas
        level={level}
        chapter={level.chapter}
        mode={settings.reducedMotion ? 'build' : 'run'}
        editor={editor}
        dispatch={noop}
        runKey={runKey}
        slowMo={false}
        quality={backdropQuality(settings)}
        reducedMotion={settings.reducedMotion}
        cameraResetKey={0}
        onRunEvent={noop}
        onRunEnd={onRunEnd}
        silent
      />
      <div className="menu-backdrop__scrim" />
    </div>
  )
}
