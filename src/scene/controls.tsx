/*
 * Scene interaction: the orbiting/panning/zooming camera rig, and the build-mode gesture layer
 * (hover, tap/drag placement, path placement, select/move/remove). Both read native pointer
 * events straight off the canvas through one shared arbiter, so a build gesture (placing or
 * dragging a piece) is always asked first and the orbit camera never steals its pointer.
 */
import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { PIECES } from '../game/pieces.ts'
import { posesAlongPath, resolveCandidate } from '../game/placement.ts'
import type { Candidate } from '../game/placement.ts'
import { GestureContext, SimContext, TRAY_DROP_ATTR } from './sceneApi.ts'
import type { PlayMode } from './sceneApi.ts'
import type {
  CameraView,
  EditorAction,
  EditorState,
  LevelDef,
  PlaceableKind,
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

interface CamState {
  target: Vec3
  distance: number
  yaw: number
  pitch: number
}

const MAX_DISTANCE = 520
const VERTICAL_FOV = (35 * Math.PI) / 180

/**
 * The level's default view fitted to the viewport. Portrait screens turn the table a quarter so
 * its long side runs up the screen (start near the thumb, goal at the top), and any screen too
 * narrow for the table pulls the camera back until the table's width fits.
 */
function framedCamera(view: CameraView, table: LevelDef['table'], aspect: number): CamState {
  const s = cloneCamera(view)
  const portrait = aspect < 1
  if (portrait) s.yaw -= Math.PI / 2
  const across = portrait ? table.depth : table.width
  const halfHorizontalFov = Math.atan(Math.tan(VERTICAL_FOV / 2) * aspect)
  const fit = (across / 2 + 10) / Math.tan(halfHorizontalFov)
  s.distance = clamp(Math.max(s.distance, fit), 35, MAX_DISTANCE)
  return s
}

function cloneCamera(view: CameraView): CamState {
  return {
    target: [view.target[0], view.target[1], view.target[2]],
    distance: view.distance,
    yaw: view.yaw,
    pitch: view.pitch,
  }
}

function clampCamera(s: CamState, table: LevelDef['table']): void {
  s.pitch = clamp(s.pitch, 0.25, 1.35)
  s.distance = clamp(s.distance, 35, MAX_DISTANCE)
  s.target[0] = clamp(s.target[0], -table.width / 2, table.width / 2)
  s.target[2] = clamp(s.target[2], -table.depth / 2, table.depth / 2)
  s.target[1] = clamp(s.target[1], 0, 30)
}

/** Move the camera target in the ground plane, screen-relative to its current yaw. */
function panBy(s: CamState, dxPx: number, dyPx: number): void {
  const speed = s.distance * 0.0016
  const rightX = Math.cos(s.yaw)
  const rightZ = -Math.sin(s.yaw)
  const fwdX = Math.sin(s.yaw)
  const fwdZ = Math.cos(s.yaw)
  s.target[0] -= (dxPx * rightX - dyPx * fwdX) * speed
  s.target[2] -= (dxPx * rightZ - dyPx * fwdZ) * speed
}

function toNDC(e: PointerEvent, canvas: HTMLCanvasElement): THREE.Vector2 {
  const rect = canvas.getBoundingClientRect()
  return new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
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
}: {
  level: LevelDef
  mode: PlayMode
  cameraResetKey: number
  reducedMotion: boolean
}) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const gesture = useContext(GestureContext)
  const sim = useContext(SimContext)

  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height))
  const portrait = aspect < 1
  const current = useRef<CamState>(framedCamera(level.camera, level.table, aspect))
  const goal = useRef<CamState>(framedCamera(level.camera, level.table, aspect))
  const preRunTarget = useRef<Vec3 | null>(null)
  const prevMode = useRef<PlayMode>(mode)
  const prevLevelId = useRef<number>(level.id)

  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const dragMode = useRef<'none' | 'orbit' | 'pan'>('none')
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null)

  // Level change: snap immediately (no smoothing).
  useEffect(() => {
    if (prevLevelId.current !== level.id) {
      current.current = framedCamera(level.camera, level.table, aspect)
      goal.current = framedCamera(level.camera, level.table, aspect)
      prevLevelId.current = level.id
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level])

  // Rotating the phone re-frames the table.
  const prevPortrait = useRef(portrait)
  useEffect(() => {
    if (prevPortrait.current === portrait) return
    prevPortrait.current = portrait
    goal.current = framedCamera(level.camera, level.table, aspect)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portrait])

  // Reset-view button: smoothly ease back to the level's default framing.
  useEffect(() => {
    goal.current = framedCamera(level.camera, level.table, aspect)
    clampCamera(goal.current, level.table)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraResetKey])

  // Remember the build-mode target across a run, and restore it smoothly on return.
  useEffect(() => {
    if (prevMode.current === 'build' && mode !== 'build') {
      const t = current.current.target
      preRunTarget.current = [t[0], t[1], t[2]]
    } else if (prevMode.current !== 'build' && mode === 'build' && preRunTarget.current) {
      goal.current.target = preRunTarget.current
      preRunTarget.current = null
    }
    prevMode.current = mode
  }, [mode])

  useGestureArbiter(gl.domElement, 'camera', {
    onPointerDown: (e) => {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      gesture.current.cameraGestureActive = true
      gesture.current.lastCameraGestureAt = performance.now()
      if (pointers.current.size >= 2) {
        dragMode.current = 'pan'
        const pts = Array.from(pointers.current.values()).slice(0, 2)
        pinch.current = {
          dist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
          cx: (pts[0].x + pts[1].x) / 2,
          cy: (pts[0].y + pts[1].y) / 2,
        }
        gl.domElement.setPointerCapture(e.pointerId)
        return
      }
      if (gesture.current.buildGestureActive) {
        dragMode.current = 'none'
        return
      }
      const isPan = e.button === 2 || (e.button === 0 && e.shiftKey)
      dragMode.current = isPan ? 'pan' : 'orbit'
      gl.domElement.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e) => {
      const p = pointers.current.get(e.pointerId)
      if (!p) return
      const prevX = p.x
      const prevY = p.y
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
          goal.current.distance = clamp(goal.current.distance / (dist / prev.dist), 35, MAX_DISTANCE)
          panBy(goal.current, cx - prev.cx, cy - prev.cy)
          clampCamera(goal.current, level.table)
        }
        pinch.current = { dist, cx, cy }
        return
      }
      if (dragMode.current === 'orbit') {
        gesture.current.lastCameraGestureAt = performance.now()
        goal.current.yaw -= (e.clientX - prevX) * 0.006
        goal.current.pitch = clamp(goal.current.pitch - (e.clientY - prevY) * 0.006, 0.25, 1.35)
        clampCamera(goal.current, level.table)
      } else if (dragMode.current === 'pan') {
        gesture.current.lastCameraGestureAt = performance.now()
        panBy(goal.current, e.clientX - prevX, e.clientY - prevY)
        clampCamera(goal.current, level.table)
      }
    },
    onPointerUp: (e) => {
      pointers.current.delete(e.pointerId)
      if (gl.domElement.hasPointerCapture(e.pointerId)) gl.domElement.releasePointerCapture(e.pointerId)
      if (pointers.current.size < 2) pinch.current = null
      if (pointers.current.size === 0) {
        dragMode.current = 'none'
        gesture.current.cameraGestureActive = false
      } else if (pointers.current.size === 1) {
        dragMode.current = gesture.current.buildGestureActive ? 'none' : 'orbit'
      }
    },
    onPointerCancel: (e) => {
      pointers.current.delete(e.pointerId)
      if (pointers.current.size < 2) pinch.current = null
      if (pointers.current.size === 0) {
        dragMode.current = 'none'
        gesture.current.cameraGestureActive = false
      }
    },
  })

  useEffect(() => {
    const el = gl.domElement
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      gesture.current.cameraGestureActive = true
      gesture.current.lastCameraGestureAt = performance.now()
      goal.current.distance = clamp(goal.current.distance * Math.exp(e.deltaY * 0.0015), 35, MAX_DISTANCE)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [gl, gesture])

  useFrame((_, dt) => {
    const dtClamped = Math.min(dt, 0.1)
    if ((mode === 'run' || mode === 'result') && !reducedMotion) {
      const activeSim = sim.current
      const focus = activeSim ? activeSim.activityFocus() : null
      if (focus && performance.now() - gesture.current.lastCameraGestureAt > 2500) {
        const a = 1 - Math.exp(-dtClamped / 1.5)
        goal.current.target[0] += (focus[0] - goal.current.target[0]) * a
        goal.current.target[1] += (focus[1] * 0.5 - goal.current.target[1]) * a
        goal.current.target[2] += (focus[2] - goal.current.target[2]) * a
      }
    }
    clampCamera(goal.current, level.table)
    const a = 1 - Math.exp(-dtClamped / 0.12)
    const cur = current.current
    const g = goal.current
    cur.target[0] += (g.target[0] - cur.target[0]) * a
    cur.target[1] += (g.target[1] - cur.target[1]) * a
    cur.target[2] += (g.target[2] - cur.target[2]) * a
    cur.distance += (g.distance - cur.distance) * a
    cur.yaw += (g.yaw - cur.yaw) * a
    cur.pitch += (g.pitch - cur.pitch) * a
    clampCamera(cur, level.table)
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
      // Empty space or a locked fixture: not a build gesture; the camera is free to orbit.
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
          const hit = pickAt(e)
          const movable = hit.pieceId ? ed.placed.some((p) => p.id === hit.pieceId) : false
          gl.domElement.style.cursor = movable ? 'grab' : 'default'
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
          if (points.length > 0) dispatchRef.current({ type: 'placePath', points })
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
