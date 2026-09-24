/*
 * Tests for src/scene/framing.ts — pure camera projection and fitting math.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { fitPose, projectPoint } from './framing.ts'
import type { CamPose, Insets, Viewport } from './framing.ts'

const VIEWPORT: Viewport = { width: 1200, height: 800 }
const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

function pose(overrides: Partial<CamPose> = {}): CamPose {
  return { target: [0, 0, 0], distance: 300, yaw: 0.4, pitch: 0.7, ...overrides }
}

test('the target point projects to NDC (0,0)', () => {
  const p = pose()
  const proj = projectPoint(p, VIEWPORT, p.target)
  assert.ok(proj.inFront)
  assert.ok(Math.abs(proj.x) < 1e-9, `x = ${proj.x}`)
  assert.ok(Math.abs(proj.y) < 1e-9, `y = ${proj.y}`)
})

function safeRectBounds(viewport: Viewport, insets: Insets) {
  const margin = 16
  const left = insets.left + margin
  const right = viewport.width - insets.right - margin
  const top = insets.top + margin
  const bottom = viewport.height - insets.bottom - margin
  return {
    xMin: (2 * left) / viewport.width - 1,
    xMax: (2 * right) / viewport.width - 1,
    yMin: 1 - (2 * bottom) / viewport.height,
    yMax: 1 - (2 * top) / viewport.height,
  }
}

function tableCorners(width: number, depth: number): [number, number, number][] {
  const pts: [number, number, number][] = []
  for (const x of [-width / 2, width / 2]) {
    for (const z of [-depth / 2, depth / 2]) {
      for (const y of [-4, 0]) pts.push([x, y, z])
    }
  }
  return pts
}

test('a fitted pose puts every input point inside the safe rect', () => {
  const points = tableCorners(220, 160)
  const insets: Insets = { top: 60, right: 120, bottom: 140, left: 10 }
  const fitted = fitPose(pose({ distance: 40 }), VIEWPORT, insets, points)
  const rect = safeRectBounds(VIEWPORT, insets)
  const eps = 1e-3
  for (const p of points) {
    const proj = projectPoint(fitted, VIEWPORT, p)
    assert.ok(proj.inFront, `point ${p} not in front`)
    assert.ok(proj.x >= rect.xMin - eps && proj.x <= rect.xMax + eps, `x ${proj.x} out of [${rect.xMin},${rect.xMax}]`)
    assert.ok(proj.y >= rect.yMin - eps && proj.y <= rect.yMax + eps, `y ${proj.y} out of [${rect.yMin},${rect.yMax}]`)
  }
})

test('bigger insets give a larger distance', () => {
  const points = tableCorners(220, 160)
  const small = fitPose(pose(), VIEWPORT, NO_INSETS, points)
  const big = fitPose(pose(), VIEWPORT, { top: 100, right: 220, bottom: 200, left: 40 }, points)
  assert.ok(big.distance > small.distance, `${big.distance} should be > ${small.distance}`)
})

test('a pose already far away is pulled in (fit returns the smallest distance)', () => {
  const points = tableCorners(220, 160)
  const near = fitPose(pose({ distance: 40 }), VIEWPORT, NO_INSETS, points)
  const far = fitPose(pose({ distance: 2500 }), VIEWPORT, NO_INSETS, points)
  assert.ok(far.distance < 500, `expected a small fitted distance, got ${far.distance}`)
  assert.ok(Math.abs(far.distance - near.distance) < 1, `${far.distance} vs ${near.distance}`)
})
