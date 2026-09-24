/*
 * Drives one physics run: builds a Simulation when a new runKey arrives in 'run' mode, steps it
 * at a fixed timestep inside useFrame, plays the matching sounds, and reports run events / the
 * final outcome back to the UI. Owns nothing visual; PiecesView / CameraRig read the same
 * Simulation off SimContext.
 */

import { useContext, useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { FIXED_DT, initPhysics, Simulation } from '../game/sim.ts'
import { audio } from '../audio.ts'
import { SimContext } from './sceneApi.ts'
import type { PlayMode, RunEvent } from './sceneApi.ts'
import type { EditorState, LevelDef, RunResult } from '../game/types.ts'

export interface RunDriverProps {
  level: LevelDef
  editor: EditorState
  mode: PlayMode
  runKey: number
  slowMo: boolean
  onRunEvent: (event: RunEvent) => void
  onRunEnd: (result: RunResult) => void
  silent?: boolean
}

const DT_CLAMP = 0.1
const MAX_STEPS_PER_FRAME = 12
const STOP_STEPPING_AFTER = 8

export function RunDriver({ level, editor, mode, runKey, slowMo, onRunEvent, onRunEnd, silent = false }: RunDriverProps): null {
  const sound = silent ? null : audio
  const sim = useContext(SimContext)
  const builtForRunKeyRef = useRef<number | null>(null)
  const accumulatorRef = useRef(0)
  const decidedAtRef = useRef<number | null>(null)
  const reportedEndRef = useRef(false)

  // Build a fresh simulation for a new run.
  useEffect(() => {
    if (mode !== 'run') return
    if (builtForRunKeyRef.current === runKey) return
    builtForRunKeyRef.current = runKey
    accumulatorRef.current = 0
    decidedAtRef.current = null
    reportedEndRef.current = false
    let cancelled = false
    void initPhysics().then(() => {
      if (cancelled) return
      sim.current?.dispose()
      sim.current = new Simulation({ table: level.table, fixtures: level.fixtures }, editor.placed)
      sound?.whoosh()
    })
    return () => {
      cancelled = true
    }
  }, [mode, runKey, level, editor, sim])

  // Leaving build tears the simulation down.
  useEffect(() => {
    if (mode !== 'build') return
    sim.current?.dispose()
    sim.current = null
    builtForRunKeyRef.current = null
  }, [mode, sim])

  // Unmount safety net.
  useEffect(() => {
    return () => {
      sim.current?.dispose()
      sim.current = null
    }
  }, [sim])

  useFrame((_state, delta) => {
    const simulation = sim.current
    if (!simulation || (mode !== 'run' && mode !== 'result')) return
    if (decidedAtRef.current !== null && simulation.time - decidedAtRef.current > STOP_STEPPING_AFTER) return

    accumulatorRef.current += Math.min(delta, DT_CLAMP) * (slowMo ? 0.5 : 1)
    let steps = 0
    while (accumulatorRef.current >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      const events = simulation.step()
      accumulatorRef.current -= FIXED_DT
      steps += 1

      for (const impact of events.impacts) {
        sound?.impact(impact.strength, impact.material)
      }
      if (events.goalReached) {
        onRunEvent({ type: 'goal', position: simulation.goalPosition })
        sound?.chime()
      }
      if (events.starCollected) {
        onRunEvent({ type: 'star', position: simulation.starPosition ?? simulation.goalPosition })
        sound?.star()
      }
      events.springs.forEach(() => sound?.spring())

      const outcome = simulation.outcome
      if (outcome !== 'running' && !reportedEndRef.current) {
        reportedEndRef.current = true
        decidedAtRef.current = simulation.time
        onRunEnd({ outcome, starCollected: simulation.starCollected, time: simulation.time })
      }
    }
  })

  return null
}
