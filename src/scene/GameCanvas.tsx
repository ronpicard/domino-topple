/*
 * The scene shell: the only scene component the UI imports. Sets up the R3F canvas, the
 * SimContext / GestureContext refs shared by the rest of the scene, and wires the diorama,
 * pieces, camera, build interaction, physics driver and post-processing together.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { SimContext, GestureContext } from './sceneApi.ts'
import type { GestureState, RunEvent, SceneProps, ViewInsets } from './sceneApi.ts'
import type { Simulation } from '../game/sim.ts'
import type { QualityTier } from '../game/types.ts'
import { allPieces } from '../game/editor.ts'
import { Diorama } from './Diorama.tsx'
import { PiecesView } from './PiecesView.tsx'
import { CameraRig, BuildLayer } from './controls.tsx'
import { MarkerOverlay, MarkerProjector } from './Markers.tsx'
import type { MarkerAnchors } from './Markers.tsx'
import { RunDriver } from './RunDriver.tsx'
import { Effects } from './Effects.tsx'
import type { GoalBurst } from './Effects.tsx'
import { useFrameTimeProbe } from './quality.ts'

const NO_INSETS: ViewInsets = { top: 0, right: 0, bottom: 0, left: 0 }

export function GameCanvas(props: SceneProps) {
  const {
    level,
    chapter,
    mode,
    editor,
    dispatch,
    runKey,
    slowMo,
    quality,
    reducedMotion,
    cameraResetKey,
    cameraCommand,
    viewInsets,
    onRunEvent,
    onRunEnd,
    onQualityMeasured,
    silent,
  } = props

  const simRef = useRef<{ current: Simulation | null }>({ current: null }).current
  const gestureRef = useRef<{ current: GestureState }>({
    current: { buildGestureActive: false, cameraGestureActive: false, lastCameraGestureAt: 0 },
  }).current

  const markerAnchors = useRef<MarkerAnchors>(new Map()).current

  const [goalLit, setGoalLit] = useState(false)
  const [goalBurst, setGoalBurst] = useState<GoalBurst | null>(null)
  const goalBurstKeyRef = useRef(0)

  // A fresh run (or a new level) clears any leftover glow / confetti from the previous one.
  useEffect(() => {
    setGoalLit(false)
    setGoalBurst(null)
  }, [runKey, level.id])

  useEffect(() => {
    if (mode === 'build') setGoalLit(false)
  }, [mode])

  const handleRunEvent = useCallback(
    (event: RunEvent) => {
      if (event.type === 'goal') {
        setGoalLit(true)
        goalBurstKeyRef.current += 1
        setGoalBurst({ position: event.position, key: goalBurstKeyRef.current })
      }
      onRunEvent(event)
    },
    [onRunEvent],
  )

  const dprCap = quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1
  const pieces = useMemo(() => allPieces(level, editor), [level, editor])

  return (
    <div className="scene-root">
      <Canvas
        shadows="percentage"
        camera={{ fov: 35, near: 1, far: 3000 }}
        dpr={[1, dprCap]}
        gl={{ antialias: quality !== 'high', powerPreference: 'high-performance' }}
        style={{ width: '100%', height: '100%', touchAction: 'none' }}
        aria-label="3D table. Use the tray and keyboard shortcuts to build."
        role="img"
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace
          if (quality === 'low') {
            gl.toneMapping = THREE.ACESFilmicToneMapping
            gl.toneMappingExposure = 1
          } else {
            // High/medium run a composer ToneMapping effect (ACES_FILMIC); avoid tone-mapping twice.
            gl.toneMapping = THREE.NoToneMapping
          }
        }}
      >
        <SimContext.Provider value={simRef}>
          <GestureContext.Provider value={gestureRef}>
            <QualityProbe onMeasured={onQualityMeasured} />
            <Diorama level={level} chapter={chapter} quality={quality} />
            <PiecesView level={level} chapter={chapter} pieces={pieces} mode={mode} editor={editor} goalLit={goalLit} quality={quality} reducedMotion={reducedMotion} />
            <CameraRig
              level={level}
              mode={mode}
              cameraResetKey={cameraResetKey}
              cameraCommand={cameraCommand ?? null}
              viewInsets={viewInsets ?? NO_INSETS}
              reducedMotion={reducedMotion}
            />
            <BuildLayer level={level} editor={editor} dispatch={dispatch} mode={mode} />
            <MarkerProjector level={level} mode={mode} anchors={markerAnchors} />
            <RunDriver
              level={level}
              editor={editor}
              mode={mode}
              runKey={runKey}
              slowMo={slowMo}
              onRunEvent={handleRunEvent}
              onRunEnd={onRunEnd}
              silent={silent}
            />
            <Effects quality={quality} mode={mode} goalBurst={goalBurst} reducedMotion={reducedMotion} />
          </GestureContext.Provider>
        </SimContext.Provider>
      </Canvas>
      <MarkerOverlay level={level} editor={editor} dispatch={dispatch} mode={mode} anchors={markerAnchors} />
    </div>
  )
}

function QualityProbe({ onMeasured }: { onMeasured?: (tier: QualityTier) => void }) {
  useFrameTimeProbe(onMeasured)
  return null
}
