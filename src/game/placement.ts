/*
 * Build-mode placement rules: grid snapping, overlap/support checks and candidate resolution.
 * Pure functions only — no three.js, React or DOM.
 */

import { isPlaceable, pieceFootprint, pieceHeightRange, pieceSupports } from './pieces.ts'
import type { Footprint, LevelDef, PlaceableKind, PlacedPiece, PlacementProblem } from './types.ts'

export const GRID = 1
export const ROTATE_STEP = Math.PI / 12
export const EPS = 0.05

export function snap(v: number): number {
  return Math.round(v / GRID) * GRID
}

/** Snap to ROTATE_STEP, normalised to (-π, π]. */
export function snapAngle(a: number): number {
  const stepped = Math.round(a / ROTATE_STEP) * ROTATE_STEP
  return normalizeAngle(stepped)
}

function normalizeAngle(a: number): number {
  let r = a % (2 * Math.PI)
  if (r <= -Math.PI) r += 2 * Math.PI
  if (r > Math.PI) r -= 2 * Math.PI
  return r
}

export function footprintCorners(f: Footprint): [number, number][] {
  const c = Math.cos(f.rotY)
  const s = Math.sin(f.rotY)
  // Local +X maps to world (c, -s); local +Z maps to world (s, c) — matches rotateXZ in pieces.ts.
  const corners: [number, number][] = []
  for (const lx of [-f.hx, f.hx]) {
    for (const lz of [-f.hz, f.hz]) {
      const wx = f.cx + lx * c + lz * s
      const wz = f.cz - lx * s + lz * c
      corners.push([wx, wz])
    }
  }
  // Order as a proper quad ring: (-,-), (+,-), (+,+), (-,+)
  return [corners[0], corners[1], corners[3], corners[2]]
}

function edgeAxes(f: Footprint): [number, number][] {
  const c = Math.cos(f.rotY)
  const s = Math.sin(f.rotY)
  // Local +X axis and local +Z axis in world space.
  return [
    [c, -s],
    [s, c],
  ]
}

function projectOntoAxis(corners: [number, number][], axis: [number, number]): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const [x, z] of corners) {
    const p = x * axis[0] + z * axis[1]
    if (p < min) min = p
    if (p > max) max = p
  }
  return [min, max]
}

/** 2D oriented-rectangle overlap (SAT), shrunk by eps: touching is allowed. */
export function footprintsOverlap(a: Footprint, b: Footprint, eps = EPS): boolean {
  const cornersA = footprintCorners(a)
  const cornersB = footprintCorners(b)
  const axes = [...edgeAxes(a), ...edgeAxes(b)]
  for (const axis of axes) {
    const [aMin, aMax] = projectOntoAxis(cornersA, axis)
    const [bMin, bMax] = projectOntoAxis(cornersB, axis)
    // Gap between the intervals on this axis (negative = overlap amount).
    if (aMax - eps <= bMin || bMax - eps <= aMin) return false
  }
  return true
}

export function pointInFootprint(x: number, z: number, f: Footprint): boolean {
  const c = Math.cos(f.rotY)
  const s = Math.sin(f.rotY)
  const dx = x - f.cx
  const dz = z - f.cz
  // Inverse-rotate the point into the footprint's local frame.
  const lx = dx * c - dz * s
  const lz = dx * s + dz * c
  return lx >= -f.hx && lx <= f.hx && lz >= -f.hz && lz <= f.hz
}

/**
 * Volumes a piece occupies: pieces with supports occupy one box per support, y in [piece.y, support.y];
 * pieces without supports occupy their halfExtents box, y in [piece.y, piece.y + 2*hy].
 */
export function occupiedBoxes(piece: PlacedPiece): { footprint: Footprint; y0: number; y1: number }[] {
  const supports = pieceSupports(piece)
  if (supports.length > 0) {
    return supports.map((s) => ({ footprint: s.footprint, y0: piece.y, y1: s.y }))
  }
  const [y0, y1] = pieceHeightRange(piece)
  return [{ footprint: pieceFootprint(piece), y0, y1 }]
}

function tableRectContains(x: number, z: number, table: LevelDef['table']): boolean {
  return x >= -table.width / 2 && x <= table.width / 2 && z >= -table.depth / 2 && z <= table.depth / 2
}

/**
 * Height of the highest support under a footprint: samples centre, 4 corners, 4 edge midpoints; the
 * table (y=0) supports points inside the table rect; other pieces via pieceSupports(). Returns null
 * if the centre sample has no support at all.
 */
export function supportHeight(f: Footprint, table: LevelDef['table'], others: PlacedPiece[]): number | null {
  const corners = footprintCorners(f)
  const edgeMids: [number, number][] = []
  for (let i = 0; i < 4; i++) {
    const a = corners[i]
    const b = corners[(i + 1) % 4]
    edgeMids.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])
  }
  const samples: [number, number][] = [[f.cx, f.cz], ...corners, ...edgeMids]

  const supportTops = others.flatMap((p) => pieceSupports(p))

  function heightAt(x: number, z: number): number | null {
    let best: number | null = null
    if (tableRectContains(x, z, table)) best = 0
    for (const s of supportTops) {
      if (pointInFootprint(x, z, s.footprint)) {
        if (best === null || s.y > best) best = s.y
      }
    }
    return best
  }

  const centreHeight = heightAt(samples[0][0], samples[0][1])
  if (centreHeight === null) return null

  let highest = centreHeight
  for (let i = 1; i < samples.length; i++) {
    const h = heightAt(samples[i][0], samples[i][1])
    if (h !== null && h > highest) highest = h
  }
  return highest
}

export function remaining(level: LevelDef, placed: PlacedPiece[], kind: PlaceableKind): number {
  const cap = level.inventory[kind]
  if (cap === undefined || cap === -1) return Infinity
  const used = placed.filter((p) => p.kind === kind).length
  return cap - used
}

export interface Candidate {
  piece: PlacedPiece
  ok: boolean
  problem?: PlacementProblem
}

/**
 * Snap x/z/rotY, compute y via supportHeight over (fixtures + placed, excluding ignoreId), validate:
 * offTable if any footprint corner is outside the table rect; noSupport if supportHeight null;
 * overlap if any occupiedBoxes pair overlaps in XZ (footprintsOverlap) AND their y ranges overlap by
 * more than EPS; inventory if placing a NEW piece (ignoreId undefined) with remaining <= 0.
 */
export function resolveCandidate(
  level: LevelDef,
  placed: PlacedPiece[],
  kind: PlaceableKind,
  x: number,
  z: number,
  rotY: number,
  id: string,
  ignoreId?: string,
  options?: { snap?: boolean },
): Candidate {
  const doSnap = options?.snap ?? true
  const sx = doSnap ? snap(x) : x
  const sz = doSnap ? snap(z) : z
  const srotY = doSnap ? snapAngle(rotY) : rotY

  const others = [...level.fixtures, ...placed].filter((p) => p.id !== ignoreId)

  const footprint = pieceFootprint({ kind, x: sx, z: sz, rotY: srotY })
  const offTable = footprintCorners(footprint).some(
    ([cx, cz]) => !tableRectContains(cx, cz, level.table),
  )

  const supportY = supportHeight(footprint, level.table, others)

  const piece: PlacedPiece = { id, kind, x: sx, y: supportY ?? 0, z: sz, rotY: srotY }

  let problem: PlacementProblem | undefined
  if (offTable) {
    problem = 'offTable'
  } else if (supportY === null) {
    problem = 'noSupport'
  } else {
    const myBoxes = occupiedBoxes(piece)
    let overlap = false
    for (const other of others) {
      const otherBoxes = occupiedBoxes(other)
      for (const mine of myBoxes) {
        for (const theirs of otherBoxes) {
          if (!footprintsOverlap(mine.footprint, theirs.footprint)) continue
          const yOverlap = Math.min(mine.y1, theirs.y1) - Math.max(mine.y0, theirs.y0)
          if (yOverlap > EPS) {
            overlap = true
            break
          }
        }
        if (overlap) break
      }
      if (overlap) break
    }
    if (overlap) {
      problem = 'overlap'
    } else if (ignoreId === undefined && remaining(level, placed, kind) <= 0) {
      problem = 'inventory'
    }
  }

  return { piece, ok: problem === undefined, problem }
}

function distance(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

/**
 * Poses every `spacing` along the polyline (arc length), starting at the first point. rotY aligns
 * the piece's local +X with the path tangent: rotY = atan2(-tz, tx). Points closer than 0.5 cm are
 * merged.
 */
export function posesAlongPath(
  points: [number, number][],
  spacing: number,
): { x: number; z: number; rotY: number }[] {
  if (points.length === 0) return []

  const merged: [number, number][] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    if (distance(merged[merged.length - 1], points[i]) >= 0.5) merged.push(points[i])
  }

  if (merged.length === 1) {
    return [{ x: merged[0][0], z: merged[0][1], rotY: 0 }]
  }

  // Precompute cumulative arc length.
  const cumLen: number[] = [0]
  for (let i = 1; i < merged.length; i++) {
    cumLen.push(cumLen[i - 1] + distance(merged[i - 1], merged[i]))
  }
  const totalLen = cumLen[cumLen.length - 1]

  function pointAt(targetLen: number): { pt: [number, number]; tangent: [number, number] } {
    if (targetLen <= 0) {
      const a = merged[0]
      const b = merged[1]
      const d = distance(a, b) || 1
      return { pt: a, tangent: [(b[0] - a[0]) / d, (b[1] - a[1]) / d] }
    }
    for (let i = 1; i < cumLen.length; i++) {
      if (targetLen <= cumLen[i] || i === cumLen.length - 1) {
        const segStart = merged[i - 1]
        const segEnd = merged[i]
        const segLen = cumLen[i] - cumLen[i - 1]
        const t = segLen > 0 ? (targetLen - cumLen[i - 1]) / segLen : 0
        const x = segStart[0] + (segEnd[0] - segStart[0]) * t
        const z = segStart[1] + (segEnd[1] - segStart[1]) * t
        const d = segLen || 1
        const tangent: [number, number] = [(segEnd[0] - segStart[0]) / d, (segEnd[1] - segStart[1]) / d]
        return { pt: [x, z], tangent }
      }
    }
    const a = merged[merged.length - 2]
    const b = merged[merged.length - 1]
    const d = distance(a, b) || 1
    return { pt: b, tangent: [(b[0] - a[0]) / d, (b[1] - a[1]) / d] }
  }

  const poses: { x: number; z: number; rotY: number }[] = []
  let travelled = 0
  while (travelled <= totalLen + 1e-9) {
    const { pt, tangent } = pointAt(travelled)
    const rotY = Math.atan2(-tangent[1], tangent[0])
    poses.push({ x: pt[0], z: pt[1], rotY })
    travelled += spacing
  }
  return poses
}

/** Recompute y for every placed piece in order (2 passes) against fixtures + other placed pieces. */
export function settleHeights(level: LevelDef, placed: PlacedPiece[]): PlacedPiece[] {
  let result = placed
  for (let pass = 0; pass < 2; pass++) {
    const next: PlacedPiece[] = []
    for (let i = 0; i < result.length; i++) {
      const piece = result[i]
      const others = [...level.fixtures, ...next, ...result.slice(i + 1)]
      const footprint = pieceFootprint(piece)
      const y = supportHeight(footprint, level.table, others)
      next.push(y === null ? piece : { ...piece, y })
    }
    result = next
  }
  return result
}

/**
 * Validate a whole layout (used by level tests): every placed piece valid against fixtures + the
 * pieces before it, inventory respected. Returns the first problem or null.
 */
export function validateLayout(
  level: LevelDef,
  placed: PlacedPiece[],
): { id: string; problem: PlacementProblem } | null {
  for (let i = 0; i < placed.length; i++) {
    const piece = placed[i]
    if (!isPlaceable(piece.kind)) continue
    const before = placed.slice(0, i)
    const candidate = resolveCandidate(
      level,
      before,
      piece.kind,
      piece.x,
      piece.z,
      piece.rotY,
      piece.id,
      undefined,
      { snap: false },
    )
    if (!candidate.ok) return { id: piece.id, problem: candidate.problem! }
  }
  return null
}
