/*
 * Pure camera-framing math for the orbit rig in controls.tsx: no three.js, no React, so the
 * projection and fitting logic can be unit-tested directly. Mirrors controls.tsx's camera
 * convention: camera position = target + distance*(sin(yaw)*cos(pitch), sin(pitch),
 * cos(yaw)*cos(pitch)), looking at target, with a 35 degree vertical field of view.
 */

export interface CamPose {
  target: [number, number, number]
  distance: number
  yaw: number
  pitch: number
}

/** Canvas size in CSS px. */
export interface Viewport {
  width: number
  height: number
}

/** Screen space (CSS px) covered by the HUD on each side. */
export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export const FOV_Y = (35 * Math.PI) / 180

const MARGIN_PX = 16
const MIN_DISTANCE = 35
const MAX_DISTANCE = 3000
const FIT_ITERATIONS = 4
const SEARCH_STEPS = 40

type Vec3 = [number, number, number]

interface CameraBasis {
  eye: Vec3
  forward: Vec3
  right: Vec3
  up: Vec3
}

function basisOf(pose: CamPose): CameraBasis {
  const { target, distance, yaw, pitch } = pose
  const cp = Math.cos(pitch)
  const dirX = Math.sin(yaw) * cp
  const dirY = Math.sin(pitch)
  const dirZ = Math.cos(yaw) * cp
  return {
    eye: [target[0] + distance * dirX, target[1] + distance * dirY, target[2] + distance * dirZ],
    forward: [-dirX, -dirY, -dirZ],
    right: [Math.cos(yaw), 0, -Math.sin(yaw)],
    up: [-Math.sin(yaw) * Math.sin(pitch), cp, -Math.cos(yaw) * Math.sin(pitch)],
  }
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

/** Project a world point with the orbit camera; returns NDC [-1..1] x/y and whether it is in front. */
export function projectPoint(
  pose: CamPose,
  viewport: Viewport,
  p: [number, number, number],
): { x: number; y: number; inFront: boolean } {
  const basis = basisOf(pose)
  const relative = sub(p, basis.eye)
  const camX = dot(relative, basis.right)
  const camY = dot(relative, basis.up)
  const camZ = dot(relative, basis.forward)
  const inFront = camZ > 1e-6
  if (!inFront) return { x: camX >= 0 ? Infinity : -Infinity, y: camY >= 0 ? Infinity : -Infinity, inFront }
  const aspect = viewport.width / Math.max(1, viewport.height)
  const tanHalfY = Math.tan(FOV_Y / 2)
  const tanHalfX = tanHalfY * aspect
  return { x: camX / (camZ * tanHalfX), y: camY / (camZ * tanHalfY), inFront }
}

interface SafeRect {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

function safeRect(viewport: Viewport, insets: Insets): SafeRect {
  const w = Math.max(1, viewport.width)
  const h = Math.max(1, viewport.height)
  const left = insets.left + MARGIN_PX
  const right = viewport.width - insets.right - MARGIN_PX
  const top = insets.top + MARGIN_PX
  const bottom = viewport.height - insets.bottom - MARGIN_PX
  return {
    xMin: (2 * left) / w - 1,
    xMax: (2 * right) / w - 1,
    // Screen y grows downward, NDC y grows upward: the pixel top maps to the larger NDC y.
    yMin: 1 - (2 * bottom) / h,
    yMax: 1 - (2 * top) / h,
  }
}

function fitsAt(pose: CamPose, viewport: Viewport, rect: SafeRect, points: Vec3[]): boolean {
  for (const p of points) {
    const proj = projectPoint(pose, viewport, p)
    if (!proj.inFront) return false
    if (proj.x < rect.xMin || proj.x > rect.xMax || proj.y < rect.yMin || proj.y > rect.yMax) return false
  }
  return true
}

function projectedBounds(pose: CamPose, viewport: Viewport, points: Vec3[]) {
  let xMin = Infinity
  let xMax = -Infinity
  let yMin = Infinity
  let yMax = -Infinity
  for (const p of points) {
    const proj = projectPoint(pose, viewport, p)
    xMin = Math.min(xMin, proj.x)
    xMax = Math.max(xMax, proj.x)
    yMin = Math.min(yMin, proj.y)
    yMax = Math.max(yMax, proj.y)
  }
  return { xMin, xMax, yMin, yMax }
}

/**
 * Fit the pose so every point projects inside the viewport minus insets (plus a 16px margin), with
 * the projected bounding box centred in that safe rect. Keeps yaw and pitch; changes target x/z and
 * distance.
 *
 * Binary-searches the smallest distance in [35, 3000] where all points fit (fitting is monotonic in
 * distance: moving the camera back only shrinks the projected spread), then shifts the target so the
 * projected bbox centre matches the safe-rect centre — converting the NDC offset to a world offset
 * along the camera's right vector and its forward vector projected on the ground, scaled by
 * distance·tan(fov/2) (·aspect for x; ÷sin(pitch) for the ground-forward axis). Repeats four times so
 * the distance search and the re-centring converge on each other.
 */
export function fitPose(pose: CamPose, viewport: Viewport, insets: Insets, points: Vec3[]): CamPose {
  const working: CamPose = { target: [...pose.target], distance: pose.distance, yaw: pose.yaw, pitch: pose.pitch }
  if (points.length === 0) return working

  const rect = safeRect(viewport, insets)
  const rectCx = (rect.xMin + rect.xMax) / 2
  const rectCy = (rect.yMin + rect.yMax) / 2
  const aspect = viewport.width / Math.max(1, viewport.height)
  const tanHalfY = Math.tan(FOV_Y / 2)

  for (let iter = 0; iter < FIT_ITERATIONS; iter++) {
    // Smallest distance in [MIN_DISTANCE, MAX_DISTANCE] where every point fits.
    let lo = MIN_DISTANCE
    let hi = MAX_DISTANCE
    if (!fitsAt({ ...working, distance: hi }, viewport, rect, points)) {
      working.distance = hi
    } else if (fitsAt({ ...working, distance: lo }, viewport, rect, points)) {
      working.distance = lo
    } else {
      for (let step = 0; step < SEARCH_STEPS; step++) {
        const mid = (lo + hi) / 2
        if (fitsAt({ ...working, distance: mid }, viewport, rect, points)) hi = mid
        else lo = mid
      }
      working.distance = hi
    }

    // Re-centre the target so the projected bbox centre lands on the safe-rect centre.
    const bounds = projectedBounds(working, viewport, points)
    const ndcDx = rectCx - (bounds.xMin + bounds.xMax) / 2
    const ndcDy = rectCy - (bounds.yMin + bounds.yMax) / 2
    const basis = basisOf(working)
    const offsetRight = -ndcDx * working.distance * tanHalfY * aspect
    const offsetGroundForward = -ndcDy * working.distance * tanHalfY / Math.sin(working.pitch)
    const groundForward: Vec3 = [-Math.sin(working.yaw), 0, -Math.cos(working.yaw)]
    working.target[0] += offsetRight * basis.right[0] + offsetGroundForward * groundForward[0]
    working.target[2] += offsetRight * basis.right[2] + offsetGroundForward * groundForward[2]
  }

  return working
}
