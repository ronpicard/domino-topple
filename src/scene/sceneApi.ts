/*
 * Contract between the React UI shell and the three.js / react-three-fiber scene.
 * The UI owns all game state; the scene renders it, turns pointer gestures into EditorActions,
 * drives the physics run, and reports run events back.
 */

import { createContext } from 'react'
import type { Simulation } from '../game/sim.ts'
import type {
  ChapterId,
  EditorAction,
  EditorState,
  LevelDef,
  QualityTier,
  RunResult,
  Vec3,
} from '../game/types.ts'

export type PlayMode = 'build' | 'run' | 'result'

export type RunEvent =
  | { type: 'goal'; position: Vec3 }
  | { type: 'star'; position: Vec3 }

/** A one-shot camera request from the HUD's camera buttons or keyboard. A new `seq` triggers it. */
export interface CameraCommand {
  kind: 'orbitLeft' | 'orbitRight' | 'zoomIn' | 'zoomOut' | 'toggleTop'
  seq: number
}

/** Screen space (CSS px) covered by the HUD on each side, so the camera frames the table in the rest. */
export interface ViewInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface SceneProps {
  level: LevelDef
  chapter: ChapterId
  mode: PlayMode
  editor: EditorState
  dispatch: (action: EditorAction) => void
  /** Increments on every GO. A new value means: build a fresh Simulation from fixtures + placed. */
  runKey: number
  /** 0.5x time scale during a run. */
  slowMo: boolean
  quality: QualityTier
  reducedMotion: boolean
  /** Increments when the player presses "reset view". */
  cameraResetKey: number
  /** Camera button presses (turn, zoom, top view). */
  cameraCommand?: CameraCommand | null
  /** HUD coverage to keep the framed table clear of. Defaults to no insets. */
  viewInsets?: ViewInsets
  onRunEvent: (event: RunEvent) => void
  /** Called once per run, when the simulation's outcome is decided (see sim.ts). */
  onRunEnd: (result: RunResult) => void
  /** No sound effects (the menu's attract loop). */
  silent?: boolean
  /** Called by the auto-quality probe once, with the tier it measured. */
  onQualityMeasured?: (tier: QualityTier) => void
}

/**
 * The live simulation during 'run' and 'result' modes, null in 'build'. RunDriver owns it;
 * PiecesView and CameraRig read `sim.transforms` / `sim.activityFocus()` in their own useFrame.
 */
export const SimContext = createContext<{ current: Simulation | null }>({ current: null })

/** Shared per-scene state for the gesture arbiter (see controls.tsx). */
export interface GestureState {
  /** True while a build gesture (placing, drawing, moving) owns the pointer, so the camera must not move. */
  buildGestureActive: boolean
  /** True while the user is orbiting / panning / zooming, so run-mode camera follow pauses. */
  cameraGestureActive: boolean
  /** performance.now() of the last camera gesture, for resuming follow after a pause. */
  lastCameraGestureAt: number
}

export const GestureContext = createContext<{ current: GestureState }>({
  current: { buildGestureActive: false, cameraGestureActive: false, lastCameraGestureAt: 0 },
})

/** DOM attribute on the tray element: dropping a dragged piece over it removes the piece. */
export const TRAY_DROP_ATTR = 'data-tray-drop'
