/*
 * Scene interaction: the panning/zooming camera rig, and the build-mode gesture layer
 * (hover, tap/drag placement, path placement, select/move/remove). Both read native pointer
 * events straight off the canvas through one shared arbiter, so a build gesture (placing or
 * dragging a piece) is always asked first and the camera never steals its pointer. Rotation
 * (yaw/pitch) only ever comes from the explicit camera commands (orbitLeft/orbitRight/toggleTop),
 * never from a pointer drag.
 */
import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { PIECES, pieceFootprint, pieceHeightRange } from '../game/pieces.ts'
import { posesAlongPath, resolveCandidate } from '../game/placement.ts'
import type { Candidate } from '../game/placement.ts'
import { fitPose } from './framing.ts'
import type { CamPose, Insets, Viewport } from './framing.ts'
import { GestureContext, SimContext, TRAY_DROP_ATTR } from './sceneApi.ts'
import { ROOM_CEILING_Y, ROOM_RADIUS } from './props/Room.tsx'
import type { CameraCommand, PlayMode, ViewInsets } from './sceneApi.ts'
import type {
  EditorAction,
  EditorState,
  LevelDef,
  PlaceableKind,
  PlacedPiece,
  Vec3,
} from '../game/types.ts'

// -------------------------------------------------------------------------------------------
// Shared pointer arbiter: exactly one native listener set per canvas, always asking the build
// gesture handler before the camera handler, regardless of which component mounted first.

interface PointerHandlers {
  onPointerDown?: (e: PointerEvent) => void
  onPointerMove?: (e: PointerEvent) => void
  onPointerUp?: (e: PointerEvent) => void
  onPointerCancel?: (e: PointerEvent) => void
  onPointerLeave?: (e: PointerEvent) => void
}

interface ArbiterEntry {
  build: PointerHandlers | null
  camera: PointerHandlers | null
}

const HANDLER_NAMES = [
  'onPointerDown',
  'onPointerMove',
  'onPointerUp',
  'onPointerCancel',
  'onPointerLeave',
] as const
const DOM_EVENT_NAMES = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerleave'] as const

const arbiters = new WeakMap<HTMLElement, ArbiterEntry>()

function getArbiter(el: HTMLElement): ArbiterEntry {
  const existing = arbiters.get(el)
  if (existing) return existing
  const entry: ArbiterEntry = { build: null, camera: null }
  arbiters.set(el, entry)
  HANDLER_NAMES.forEach((name, i) => {
    el.addEventListener(DOM_EVENT_NAMES[i], (e) => {
      // Build gestures are asked first: placing or dragging a piece always wins the pointer.
      entry.build?.[name]?.(e as PointerEvent)
      entry.camera?.[name]?.(e as PointerEvent)
    })
  })
  return entry
}

function useGestureArbiter(el: HTMLElement | null, role: 'build' | 'camera', handlers: PointerHandlers): void {
  const ref = useRef(handlers)
  ref.current = handlers
  useEffect(() => {
    if (!el) return undefined
    const entry = getArbiter(el)
    const wrapped: PointerHandlers = {
      onPointerDown: (e) => ref.current.onPointerDown?.(e),
      onPointerMove: (e) => ref.current.onPointerMove?.(e),
      onPointerUp: (e) => ref.current.onPointerUp?.(e),
      onPointerCancel: (e) => ref.current.onPointerCancel?.(e),
      onPointerLeave: (e) => ref.current.onPointerLeave?.(e),
    }
    entry[role] = wrapped
    return () => {
      if (entry[role] === wrapped) entry[role] = null
    }
  }, [el, role])
}

// -------------------------------------------------------------------------------------------
// Small math helpers.

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

const MIN_DISTANCE = 35
const PITCH_MIN = 0.3
const PITCH_MAX = 1.45
/** Pitch the camera settles to when fully zoomed out: low enough to take in the room's walls. */
const OVERVIEW_PITCH = 0.32
/** Clearance kept between the eye and the room's wall / ceiling. */
const ROOM_MARGIN = 30

function clampCamera(s: CamPose, table: LevelDef['table'], maxDistance: number): void {
  s.pitch = clamp(s.pitch, PITCH_MIN, PITCH_MAX)
  s.target[0] = clamp(s.target[0], -table.width / 2, table.width / 2)
  s.target[2] = clamp(s.target[2], -table.depth / 2, table.depth / 2)
  s.target[1] = clamp(s.target[1], 0, 30)
  // Never back the eye out through the room's wall or ceiling (Room.tsx): the wall is only drawn
  // from the inside, so from beyond it the whole room vanishes.
  const wallRoom = (ROOM_RADIUS - ROOM_MARGIN - Math.hypot(s.target[0], s.target[2])) / Math.cos(s.pitch)
  const ceilingRoom = (ROOM_CEILING_Y - ROOM_MARGIN - s.target[1]) / Math.sin(s.pitch)
  s.distance = clamp(s.distance, MIN_DISTANCE, Math.min(maxDistance, wallRoom, ceilingRoom))
}

/**
 * The pitch a zoom level implies while not in top view: the level's own framing pitch up to the
 * fitted distance, easing down to OVERVIEW_PITCH at the zoom-out limit (twice the fitted
 * distance). Only the explicit zoom-out command lowers the camera to this (stepping back to look
 * around the room); wheel and pinch zoom never tilt the view, though zooming back in by any means
 * raises it to the framing pitch again.
 */
function pitchForDistance(distance: number, fittedDistance: number, framingPitch: number): number {
  const t = clamp((distance - fittedDistance) / Math.max(1, fittedDistance), 0, 1)
  const eased = t * t * (3 - 2 * t)
  return framingPitch + (OVERVIEW_PITCH - framingPitch) * eased
}

/** The 8 corners of the table slab, including its border, at floor and table-top height. */
function tableFramingPoints(table: LevelDef['table']): Vec3[] {
  const hx = table.width / 2 + 8
  const hz = table.depth / 2 + 8
  const pts: Vec3[] = []
  for (const x of [-hx, hx]) {
    for (const z of [-hz, hz]) {
      for (const y of [-4, 0]) pts.push([x, y, z])
    }
  }
  return pts
}

/** The 4 corners of a fixture's footprint, at the top of its bounding box. */
function fixtureFramingPoints(fixture: PlacedPiece): Vec3[] {
  const fp = pieceFootprint(fixture)
  const top = pieceHeightRange(fixture)[1]
  const cos = Math.cos(fp.rotY)
  const sin = Math.sin(fp.rotY)
  const pts: Vec3[] = []
  for (const lx of [-fp.hx, fp.hx]) {
    for (const lz of [-fp.hz, fp.hz]) {
      pts.push([fp.cx + lx * cos + lz * sin, top, fp.cz - lx * sin + lz * cos])
    }
  }
  return pts
}

function framingPoints(level: LevelDef): Vec3[] {
  const pts = tableFramingPoints(level.table)
  for (const fixture of level.fixtures) pts.push(...fixtureFramingPoints(fixture))
  return pts
}

/**
 * The level's default view fitted to the viewport, minus the HUD insets. Portrait screens turn
 * the table a quarter so its long side runs up the screen (start near the thumb, goal at the
 * top); `fitPose` then pulls the camera to whatever distance and target keep the table and every
 * fixture on screen.
 */
function framedCamera(level: LevelDef, viewport: Viewport, insets: Insets): CamPose {
  const aspect = viewport.width / Math.max(1, viewport.height)
  const view = level.camera
  const portrait = aspect < 1
  const base: CamPose = {
    target: [view.target[0], view.target[1], view.target[2]],
    distance: view.distance,
    yaw: portrait ? view.yaw - Math.PI / 2 : view.yaw,
    pitch: view.pitch,
  }
  return fitPose(base, viewport, insets, framingPoints(level))
}

function ndcFromClient(clientX: number, clientY: number, canvas: HTMLCanvasElement): THREE.Vector2 {
  const rect = canvas.getBoundingClientRect()
  return new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  )
}

// -------------------------------------------------------------------------------------------
// Picking: world x/z from a support surface or a piece's top face (falling back to y = 0), plus
// the id of whichever piece was hit (marked by PiecesView via userData).

interface PickResult {
  x: number | null
  z: number | null
  pieceId?: string
}

function pieceIdOf(object: THREE.Object3D, instanceId: number | undefined): string | undefined {
  let o: THREE.Object3D | null = object
  while (o) {
    const ud = o.userData as { pieceId?: string; instancePieceIds?: string[] }
    if (typeof ud.pieceId === 'string') return ud.pieceId
    if (ud.instancePieceIds && instanceId !== undefined) return ud.instancePieceIds[instanceId]
    o = o.parent
  }
  return undefined
}

function pick(raycaster: THREE.Raycaster, camera: THREE.Camera, scene: THREE.Scene, ndc: THREE.Vector2): PickResult {
  raycaster.setFromCamera(ndc, camera)
  const hits = raycaster.intersectObjects(scene.children, true)
  let x: number | null = null
  let z: number | null = null
  let pieceId: string | undefined
  for (const hit of hits) {
    const obj = hit.object
    if (x === null) {
      const isSupport = (obj.userData as { support?: boolean }).support === true
      if (isSupport) {
        x = hit.point.x
        z = hit.point.z
      } else if (hit.face) {
        const worldNormal = hit.face.normal.clone().transformDirection(obj.matrixWorld)
        if (worldNormal.y > 0.7 && pieceIdOf(obj, hit.instanceId) !== undefined) {
          x = hit.point.x
          z = hit.point.z
        }
      }
    }
    if (pieceId === undefined) pieceId = pieceIdOf(obj, hit.instanceId)
    if (x !== null && pieceId !== undefined) break
  }
  if (x === null || z === null) {
    const ray = raycaster.ray
    if (Math.abs(ray.direction.y) > 1e-6) {
      const t = -ray.origin.y / ray.direction.y
      if (t > 0) {
        x = ray.origin.x + ray.direction.x * t
        z = ray.origin.z + ray.direction.z * t
      }
    }
  }
  return { x, z, pieceId }
}

// -------------------------------------------------------------------------------------------

export function CameraRig({
  level,
  mode,
  cameraResetKey,
  reducedMotion,
  cameraCommand,
  viewInsets,
}: {
  level: LevelDef
  mode: PlayMode
  cameraResetKey: number
  reducedMotion: boolean
  cameraCommand: CameraCommand | null
  viewInsets: ViewInsets
}) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const gesture = useContext(GestureContext)
  const sim = useContext(SimContext)

  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const groundPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), [])

  const levelRef = useRef(level)
  levelRef.current = level
  const modeRef = useRef(mode)
  modeRef.current = mode

  const current = useRef<CamPose>(framedCamera(level, size, viewInsets))
  const goal = useRef<CamPose>(framedCamera(level, size, viewInsets))
  const maxDistance = useRef(goal.current.distance * 2)
  const fittedDistance = useRef(goal.current.distance)
  const defaultPitch = useRef(goal.current.pitch)
  const rememberedPitch = useRef<number | null>(null)
  const userMoved = useRef(false)
  const followSuspended = useRef(false)
  const lastFramed = useRef({ width: size.width, height: size.height, insets: viewInsets })
  const preRunTarget = useRef<Vec3 | null>(null)
  const prevMode = useRef<PlayMode>(mode)
  const prevLevelId = useRef<number>(level.id)
  const prevCmdSeq = useRef<number | null>(cameraCommand ? cameraCommand.seq : null)

  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const dragMode = useRef<'none' | 'grabPan'>('none')
  const pinch = useRef<{ dist: number } | null>(null)
  const panAnchor = useRef<THREE.Vector3 | null>(null)

  function raycastGround(ndc: THREE.Vector2): THREE.Vector3 | null {
    raycaster.setFromCamera(ndc, camera)
    const hit = new THREE.Vector3()
    return raycaster.ray.intersectPlane(groundPlane, hit) ? hit : null
  }

  function markCameraGesture() {
    userMoved.current = true
    if (mode === 'run' || mode === 'result') followSuspended.current = true
  }

  /** Zoom toward a screen point (wheel, pinch): keep the ground point under it roughly fixed. */
  function zoomTowardScreenPoint(clientX: number, clientY: number, factor: number) {
    const table = levelRef.current.table
    const oldDistance = goal.current.distance
    const newDistance = clamp(oldDistance * factor, MIN_DISTANCE, maxDistance.current)
    const hit = raycastGround(ndcFromClient(clientX, clientY, gl.domElement))
    goal.current.distance = newDistance
    if (hit && oldDistance > 0) {
      const t = 1 - newDistance / oldDistance
      goal.current.target[0] += (hit.x - goal.current.target[0]) * t
      goal.current.target[2] += (hit.z - goal.current.target[2]) * t
    }
    clampCamera(goal.current, table, maxDistance.current)
  }

  // Level change: snap immediately (no smoothing).
  useEffect(() => {
    if (prevLevelId.current !== level.id) {
      current.current = framedCamera(level, size, viewInsets)
      goal.current = framedCamera(level, size, viewInsets)
      maxDistance.current = goal.current.distance * 2
      fittedDistance.current = goal.current.distance
      defaultPitch.current = goal.current.pitch
      rememberedPitch.current = null
      userMoved.current = false
      lastFramed.current = { width: size.width, height: size.height, insets: viewInsets }
      prevLevelId.current = level.id
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level])

  // Reset-view button: ease back to the level's default framing.
  useEffect(() => {
    const fitted = framedCamera(level, size, viewInsets)
    goal.current = fitted
    maxDistance.current = fitted.distance * 2
    fittedDistance.current = fitted.distance
    defaultPitch.current = fitted.pitch
    rememberedPitch.current = null
    userMoved.current = false
    clampCamera(goal.current, level.table, maxDistance.current)
    lastFramed.current = { width: size.width, height: size.height, insets: viewInsets }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraResetKey])

  // Re-frame when the HUD insets change or the canvas resizes by more than 40px, but only while
  // the player hasn't taken the camera since the last framing.
  useEffect(() => {
    const last = lastFramed.current
    const sizeChanged = Math.abs(size.width - last.width) > 40 || Math.abs(size.height - last.height) > 40
    const insetsChanged =
      viewInsets.top !== last.insets.top ||
      viewInsets.right !== last.insets.right ||
      viewInsets.bottom !== last.insets.bottom ||
      viewInsets.left !== last.insets.left
    if (!sizeChanged && !insetsChanged) return
    lastFramed.current = { width: size.width, height: size.height, insets: viewInsets }
    if (userMoved.current) return
    const fitted = framedCamera(level, size, viewInsets)
    goal.current = fitted
    maxDistance.current = fitted.distance * 2
    fittedDistance.current = fitted.distance
    defaultPitch.current = fitted.pitch
    clampCamera(goal.current, level.table, maxDistance.current)
  })

  // Remember the build-mode target across a run, and restore it smoothly on return. A fresh run
  // also clears the "user took the camera" flag that pauses activity-follow.
  useEffect(() => {
    if (prevMode.current === 'build' && mode !== 'build') {
      const t = current.current.target
      preRunTarget.current = [t[0], t[1], t[2]]
    } else if (prevMode.current !== 'build' && mode === 'build' && preRunTarget.current) {
      goal.current.target = preRunTarget.current
      preRunTarget.current = null
    }
    if (mode === 'run' && prevMode.current !== 'run') followSuspended.current = false
    prevMode.current = mode
  }, [mode])

  // Camera button / keyboard commands. `seq` starts equal to the ref, so the initial value on
  // mount is never acted on.
  useEffect(() => {
    if (!cameraCommand) return
    if (cameraCommand.seq === prevCmdSeq.current) return
    prevCmdSeq.current = cameraCommand.seq
    markCameraGesture()
    switch (cameraCommand.kind) {
      case 'orbitLeft':
        goal.current.yaw -= Math.PI / 4
        break
      case 'orbitRight':
        goal.current.yaw += Math.PI / 4
        break
      case 'zoomIn':
        goal.current.distance = clamp(goal.current.distance * 0.75, MIN_DISTANCE, maxDistance.current)
        break
      case 'zoomOut':
        goal.current.distance = clamp(goal.current.distance * 1.33, MIN_DISTANCE, maxDistance.current)
        if (goal.current.pitch < 1.3) {
          goal.current.pitch = pitchForDistance(goal.current.distance, fittedDistance.current, defaultPitch.current)
        }
        break
      case 'toggleTop':
        if (goal.current.pitch < 1.3) {
          rememberedPitch.current = goal.current.pitch
          goal.current.pitch = 1.45
        } else {
          goal.current.pitch = rememberedPitch.current ?? defaultPitch.current
          rememberedPitch.current = null
        }
        break
    }
    clampCamera(goal.current, level.table, maxDistance.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraCommand, mode, level])

  useGestureArbiter(gl.domElement, 'camera', {
    onPointerDown: (e) => {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      gesture.current.cameraGestureActive = true
      gesture.current.lastCameraGestureAt = performance.now()
      if (pointers.current.size >= 2) {
        const pts = Array.from(pointers.current.values()).slice(0, 2)
        const cx = (pts[0].x + pts[1].x) / 2
        const cy = (pts[0].y + pts[1].y) / 2
        pinch.current = { dist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) }
        panAnchor.current = raycastGround(ndcFromClient(cx, cy, gl.domElement))
        dragMode.current = 'grabPan'
        gl.domElement.style.cursor = 'grabbing'
        markCameraGesture()
        gl.domElement.setPointerCapture(e.pointerId)
        return
      }
      if (gesture.current.buildGestureActive) {
        dragMode.current = 'none'
        return
      }
      dragMode.current = 'grabPan'
      panAnchor.current = raycastGround(ndcFromClient(e.clientX, e.clientY, gl.domElement))
      gl.domElement.style.cursor = 'grabbing'
      markCameraGesture()
      gl.domElement.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e) => {
      const p = pointers.current.get(e.pointerId)
      if (!p) return
      p.x = e.clientX
      p.y = e.clientY
      if (pointers.current.size >= 2) {
        const pts = Array.from(pointers.current.values()).slice(0, 2)
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
        const cx = (pts[0].x + pts[1].x) / 2
        const cy = (pts[0].y + pts[1].y) / 2
        const prev = pinch.current
        if (prev && prev.dist > 0 && dist > 0) {
          gesture.current.lastCameraGestureAt = performance.now()
          // Pinch zooms about the midpoint, and midpoint movement pans — both read off the same
          // two touches at once.
          zoomTowardScreenPoint(cx, cy, prev.dist / dist)
          const hit = raycastGround(ndcFromClient(cx, cy, gl.domElement))
          if (panAnchor.current && hit) {
            const dx = panAnchor.current.x - hit.x
            const dz = panAnchor.current.z - hit.z
            goal.current.target[0] += dx
            goal.current.target[2] += dz
            current.current.target[0] += dx
            current.current.target[2] += dz
          }
          clampCamera(goal.current, levelRef.current.table, maxDistance.current)
          clampCamera(current.current, levelRef.current.table, maxDistance.current)
        }
        pinch.current = { dist }
        return
      }
      if (dragMode.current === 'grabPan') {
        gesture.current.lastCameraGestureAt = performance.now()
        // Re-raycast the pointer and shift the target by (anchor - hit): the world point grabbed
        // at gesture start stays glued to the pointer, with no smoothing lag.
        const hit = raycastGround(ndcFromClient(e.clientX, e.clientY, gl.domElement))
        if (panAnchor.current && hit) {
          const dx = panAnchor.current.x - hit.x
          const dz = panAnchor.current.z - hit.z
          goal.current.target[0] += dx
          goal.current.target[2] += dz
          current.current.target[0] += dx
          current.current.target[2] += dz
        }
        clampCamera(goal.current, levelRef.current.table, maxDistance.current)
        clampCamera(current.current, levelRef.current.table, maxDistance.current)
      }
    },
    onPointerUp: (e) => {
      pointers.current.delete(e.pointerId)
      if (gl.domElement.hasPointerCapture(e.pointerId)) gl.domElement.releasePointerCapture(e.pointerId)
      if (pointers.current.size < 2) pinch.current = null
      if (pointers.current.size === 0) {
        dragMode.current = 'none'
        gesture.current.cameraGestureActive = false
        panAnchor.current = null
      } else if (pointers.current.size === 1) {
        // Dropped from two fingers to one: keep panning with the remaining finger.
        const remaining = Array.from(pointers.current.values())[0]
        if (gesture.current.buildGestureActive) {
          dragMode.current = 'none'
          panAnchor.current = null
        } else {
          dragMode.current = 'grabPan'
          panAnchor.current = raycastGround(ndcFromClient(remaining.x, remaining.y, gl.domElement))
          gl.domElement.style.cursor = 'grabbing'
        }
      }
    },
    onPointerCancel: (e) => {
      pointers.current.delete(e.pointerId)
      if (pointers.current.size < 2) pinch.current = null
      if (pointers.current.size === 0) {
        dragMode.current = 'none'
        gesture.current.cameraGestureActive = false
        panAnchor.current = null
      }
    },
  })

  useEffect(() => {
    const el = gl.domElement
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      gesture.current.cameraGestureActive = true
      gesture.current.lastCameraGestureAt = performance.now()
      userMoved.current = true
      if (modeRef.current === 'run' || modeRef.current === 'result') followSuspended.current = true
      zoomTowardScreenPoint(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0015))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, gesture])

  // Right-button drag pans the camera like any other button (see the pointer-down handler
  // above); stop the browser's own context menu from popping up over it.
  useEffect(() => {
    const el = gl.domElement
    const onContextMenu = (e: Event) => e.preventDefault()
    el.addEventListener('contextmenu', onContextMenu)
    return () => el.removeEventListener('contextmenu', onContextMenu)
  }, [gl])

  useFrame((_, dt) => {
    const dtClamped = Math.min(dt, 0.1)
    if ((mode === 'run' || mode === 'result') && !reducedMotion && !followSuspended.current) {
      const activeSim = sim.current
      const focus = activeSim ? activeSim.activityFocus() : null
      if (focus) {
        const a = 1 - Math.exp(-dtClamped / 1.2)
        goal.current.target[0] += (focus[0] - goal.current.target[0]) * a
        goal.current.target[2] += (focus[2] - goal.current.target[2]) * a
      }
    }
    // Outside top view, zooming in lifts a lowered (overview) camera back toward the framing
    // pitch; nothing here ever lowers it.
    if (goal.current.pitch < 1.3) {
      const implied = pitchForDistance(goal.current.distance, fittedDistance.current, defaultPitch.current)
      if (goal.current.pitch < implied) goal.current.pitch = implied
    }
    clampCamera(goal.current, level.table, maxDistance.current)
    const a = 1 - Math.exp(-dtClamped / 0.12)
    const cur = current.current
    const g = goal.current
    cur.target[0] += (g.target[0] - cur.target[0]) * a
    cur.target[1] += (g.target[1] - cur.target[1]) * a
    cur.target[2] += (g.target[2] - cur.target[2]) * a
    cur.distance += (g.distance - cur.distance) * a
    cur.yaw += (g.yaw - cur.yaw) * a
    cur.pitch += (g.pitch - cur.pitch) * a
    clampCamera(cur, level.table, maxDistance.current)
    const cp = Math.cos(cur.pitch)
    camera.position.set(
      cur.target[0] + cur.distance * Math.sin(cur.yaw) * cp,
      cur.target[1] + cur.distance * Math.sin(cur.pitch),
      cur.target[2] + cur.distance * Math.cos(cur.yaw) * cp,
    )
    camera.lookAt(cur.target[0], cur.target[1], cur.target[2])
  })

  return null
}

// -------------------------------------------------------------------------------------------

export function BuildLayer({
  level,
  editor,
  dispatch,
  mode,
}: {
  level: LevelDef
  editor: EditorState
  dispatch: (action: EditorAction) => void
  mode: PlayMode
}) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const gesture = useContext(GestureContext)
  const raycaster = useMemo(() => new THREE.Raycaster(), [])

  const editorRef = useRef(editor)
  editorRef.current = editor
  const levelRef = useRef(level)
  levelRef.current = level
  const dispatchRef = useRef(dispatch)
  dispatchRef.current = dispatch
  const modeRef = useRef(mode)
  modeRef.current = mode

  const pathPoints = useRef<[number, number][]>([])
  const gestureActive = useRef(false)
  const movingId = useRef<string | null>(null)
  const grabOffset = useRef<{ dx: number; dz: number }>({ dx: 0, dz: 0 })
  const activePointerId = useRef<number | null>(null)
  const clickCandidate = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  /** The placed piece under a placing tool's pointer-down, so a plain tap on it selects it. */
  const tapPieceId = useRef<string | null>(null)

  const [preview, setPreview] = useState<Candidate[]>([])

  useEffect(() => {
    if (mode !== 'build') {
      pathPoints.current = []
      movingId.current = null
      gestureActive.current = false
      clickCandidate.current = null
      setPreview([])
      gesture.current.buildGestureActive = false
    }
  }, [mode, gesture])

  function pickAt(e: PointerEvent): PickResult {
    return pick(raycaster, camera, scene, toNDC(e, gl.domElement))
  }

  function updatePathPreview(tool: PlaceableKind) {
    const spacing = PIECES[tool].pathSpacing
    if (!spacing || pathPoints.current.length < 2) {
      setPreview([])
      return
    }
    const poses = posesAlongPath(pathPoints.current, spacing)
    const lvl = levelRef.current
    const placed = editorRef.current.placed
    setPreview(
      poses.map((p, i) =>
        resolveCandidate(lvl, placed, tool, p.x, p.z, p.rotY, `__preview_${i}__`, undefined, { snap: false }),
      ),
    )
  }

  function resetCursor() {
    gl.domElement.style.cursor = editorRef.current.tool ? 'crosshair' : 'default'
  }

  function cancelGesture() {
    const id = activePointerId.current
    if (id !== null && gl.domElement.hasPointerCapture(id)) gl.domElement.releasePointerCapture(id)
    if (movingId.current && editorRef.current.dragOrigin) {
      dispatchRef.current({ type: 'load', placed: editorRef.current.dragOrigin })
    }
    pathPoints.current = []
    movingId.current = null
    activePointerId.current = null
    gestureActive.current = false
    gesture.current.buildGestureActive = false
    setPreview([])
    resetCursor()
  }

  useGestureArbiter(gl.domElement, 'build', {
    onPointerDown: (e) => {
      if (modeRef.current !== 'build') return
      // Build gestures only start for the primary button (touch/pen report 0 too), and not for a
      // shift+left click on a mouse — that falls through to the camera and slides the view.
      if (e.button !== 0 || (e.pointerType === 'mouse' && e.shiftKey)) return
      if (gestureActive.current) {
        // A second pointer arrived mid-gesture: cancel and hand over to the camera (pinch/pan).
        cancelGesture()
        return
      }
      const hit = pickAt(e)
      const ed = editorRef.current
      if (ed.tool) {
        gestureActive.current = true
        gesture.current.buildGestureActive = true
        activePointerId.current = e.pointerId
        gl.domElement.setPointerCapture(e.pointerId)
        pathPoints.current = hit.x !== null && hit.z !== null ? [[hit.x, hit.z]] : []
        tapPieceId.current = hit.pieceId && ed.placed.some((p) => p.id === hit.pieceId && !p.locked) ? hit.pieceId : null
        if (hit.x !== null && hit.z !== null) dispatchRef.current({ type: 'hover', x: hit.x, z: hit.z })
        setPreview([])
        return
      }
      const piece = hit.pieceId ? ed.placed.find((p) => p.id === hit.pieceId) : undefined
      if (piece) {
        gestureActive.current = true
        gesture.current.buildGestureActive = true
        activePointerId.current = e.pointerId
        gl.domElement.setPointerCapture(e.pointerId)
        movingId.current = piece.id
        grabOffset.current = { dx: piece.x - (hit.x ?? piece.x), dz: piece.z - (hit.z ?? piece.z) }
        gl.domElement.style.cursor = 'grabbing'
        dispatchRef.current({ type: 'select', id: piece.id })
        return
      }
      // Empty space or a locked fixture: not a build gesture; the camera is free to grab-pan.
      // Track it in case it turns out to be a plain click (deselect).
      clickCandidate.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY }
    },
    onPointerMove: (e) => {
      if (modeRef.current !== 'build') return
      if (gestureActive.current && activePointerId.current === e.pointerId) {
        const hit = pickAt(e)
        if (hit.x === null || hit.z === null) return
        const ed = editorRef.current
        if (ed.tool) {
          const pts = pathPoints.current
          const last = pts[pts.length - 1]
          if (!last || Math.hypot(hit.x - last[0], hit.z - last[1]) >= 0.8) {
            pts.push([hit.x, hit.z])
            updatePathPreview(ed.tool)
          }
          dispatchRef.current({ type: 'hover', x: hit.x, z: hit.z })
        } else if (movingId.current) {
          dispatchRef.current({
            type: 'move',
            id: movingId.current,
            x: hit.x + grabOffset.current.dx,
            z: hit.z + grabOffset.current.dz,
            commit: false,
          })
        }
        return
      }
      // Hover ghost + cursor feedback for a fine (mouse) pointer with no button held.
      if (!gestureActive.current && e.pointerType === 'mouse' && e.buttons === 0) {
        const ed = editorRef.current
        if (ed.tool) {
          const hit = pickAt(e)
          if (hit.x !== null && hit.z !== null) dispatchRef.current({ type: 'hover', x: hit.x, z: hit.z })
          gl.domElement.style.cursor = 'crosshair'
        } else {
          // The Hand tool always offers a grab: empty table grab-pans the view, a placed piece
          // grab-moves it.
          gl.domElement.style.cursor = 'grab'
        }
      }
    },
    onPointerUp: (e) => {
      if (modeRef.current !== 'build') return
      if (gestureActive.current && activePointerId.current === e.pointerId) {
        const ed = editorRef.current
        if (ed.tool) {
          const pts = pathPoints.current
          let length = 0
          for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
          const hit = pickAt(e)
          const lastPoint: [number, number] | null =
            hit.x !== null && hit.z !== null ? [hit.x, hit.z] : (pts[0] ?? null)
          const points = length < 2 ? (lastPoint ? [lastPoint] : []) : pts
          if (length < 2 && tapPieceId.current && hit.pieceId === tapPieceId.current) {
            // A tap on a placed piece edits it rather than trying to place on top of it.
            dispatchRef.current({ type: 'select', id: tapPieceId.current })
          } else if (points.length > 0) {
            dispatchRef.current({ type: 'placePath', points })
          }
        } else if (movingId.current) {
          const droppedOnTray = document.elementFromPoint(e.clientX, e.clientY)?.closest(`[${TRAY_DROP_ATTR}]`)
          if (droppedOnTray) {
            dispatchRef.current({ type: 'remove', id: movingId.current })
          } else {
            const hit = pickAt(e)
            if (hit.x !== null && hit.z !== null) {
              dispatchRef.current({
                type: 'move',
                id: movingId.current,
                x: hit.x + grabOffset.current.dx,
                z: hit.z + grabOffset.current.dz,
                commit: true,
              })
            }
          }
        }
        if (gl.domElement.hasPointerCapture(e.pointerId)) gl.domElement.releasePointerCapture(e.pointerId)
        pathPoints.current = []
        tapPieceId.current = null
        movingId.current = null
        activePointerId.current = null
        gestureActive.current = false
        gesture.current.buildGestureActive = false
        setPreview([])
        resetCursor()
        return
      }
      const click = clickCandidate.current
      if (click && click.pointerId === e.pointerId) {
        const dist = Math.hypot(e.clientX - click.x, e.clientY - click.y)
        if (dist < 6 && !editorRef.current.tool) dispatchRef.current({ type: 'select', id: null })
      }
      clickCandidate.current = null
    },
    onPointerCancel: () => {
      if (gestureActive.current) cancelGesture()
      clickCandidate.current = null
    },
    onPointerLeave: () => {
      if (!gestureActive.current) {
        dispatchRef.current({ type: 'clearGhost' })
        gl.domElement.style.cursor = 'default'
      }
    },
  })

  if (mode !== 'build' || preview.length === 0 || !editor.tool) return null
  const half = PIECES[editor.tool].halfExtents
  return (
    <group>
      {preview.map((c, i) => (
        <mesh key={i} position={[c.piece.x, c.piece.y + half[1], c.piece.z]} rotation={[0, c.piece.rotY, 0]}>
          <boxGeometry args={[half[0] * 2, half[1] * 2, half[2] * 2]} />
          <meshBasicMaterial color={c.ok ? '#ffffff' : '#ff4d4d'} transparent opacity={0.45} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function toNDC(e: PointerEvent, canvas: HTMLCanvasElement): THREE.Vector2 {
  return ndcFromClient(e.clientX, e.clientY, canvas)
}
