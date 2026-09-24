/*
 * Theme-aware three.js materials for scene parts: one hook that builds the full MaterialKey set for
 * the current chapter (and quality tier), memoised and disposed on change, plus small canvas
 * textures (procedural wood grain, domino pip faces) shared across every piece that needs them.
 */

import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { ChapterId, MaterialKey, QualityTier } from '../game/types.ts'
import type { ChapterTheme } from './themes.ts'
import { THEMES } from './themes.ts'

// -------------------------------------------------------------------------------------------
// Procedural textures

let woodTexture: THREE.CanvasTexture | null = null

/** 512² tileable wood-grain texture: base tone + noisy horizontal stripes. Built once, shared. */
export function woodGrainTexture(): THREE.CanvasTexture {
  if (woodTexture) return woodTexture
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    woodTexture = new THREE.CanvasTexture(canvas)
    return woodTexture
  }
  ctx.fillStyle = '#9c6a3f'
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 220; i++) {
    const y = Math.random() * size
    const h = 0.6 + Math.random() * 2.6
    const dark = Math.random() > 0.5
    ctx.fillStyle = dark ? `rgba(60,32,14,${0.05 + Math.random() * 0.14})` : `rgba(230,190,140,${0.04 + Math.random() * 0.1})`
    ctx.fillRect(0, y, size, h)
  }
  // Faint long grain waves.
  for (let i = 0; i < 8; i++) {
    const y0 = (i / 8) * size + Math.random() * 20
    ctx.strokeStyle = `rgba(50,26,10,${0.05 + Math.random() * 0.08})`
    ctx.lineWidth = 1 + Math.random() * 2
    ctx.beginPath()
    ctx.moveTo(0, y0)
    for (let x = 0; x <= size; x += 32) {
      ctx.lineTo(x, y0 + Math.sin(x * 0.02 + i) * 6 + (Math.random() - 0.5) * 4)
    }
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(1.5, 1.5)
  tex.colorSpace = THREE.SRGBColorSpace
  woodTexture = tex
  return tex
}

const pipTextureCache = new Map<string, THREE.CanvasTexture>()

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const bigint = parseInt(clean, 16)
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255]
}

/**
 * A realistic ivory-domino face texture in the given pip colour, cached per colour: an engraved
 * divider groove, a small brass spinner at the centre, and two pip groups (six over three) drawn
 * as drilled, slightly concave dots. 512² with the face inset in a central rect so it reads
 * correctly when mapped onto a plane 1.5× the domino's side (see dominoPipTexture callers).
 */
export function dominoPipTexture(pipColor: string): THREE.CanvasTexture {
  const cached = pipTextureCache.get(pipColor)
  if (cached) return cached
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const tex = new THREE.CanvasTexture(canvas)
  if (!ctx) {
    pipTextureCache.set(pipColor, tex)
    return tex
  }
  ctx.clearRect(0, 0, size, size)

  const faceX0 = 86
  const faceY0 = 86
  const faceX1 = 426
  const faceY1 = 426
  const w = faceX1 - faceX0
  const h = faceY1 - faceY0
  const midY = (faceY0 + faceY1) / 2
  const [pr, pg, pb] = hexToRgb(pipColor)

  // Engraved divider: a dark groove line with a lighter highlight just below it.
  ctx.strokeStyle = `rgba(${pr},${pg},${pb},0.75)`
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(faceX0, midY)
  ctx.lineTo(faceX1, midY)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(faceX0, midY + 3.5)
  ctx.lineTo(faceX1, midY + 3.5)
  ctx.stroke()

  // Brass spinner at the exact centre.
  const cx0 = size / 2
  const cy0 = size / 2
  ctx.fillStyle = '#c9a24a'
  ctx.beginPath()
  ctx.arc(cx0, cy0, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#8a6a2a'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx0, cy0, 7, 0, Math.PI * 2)
  ctx.stroke()

  // Each pip: a radial gradient (opaque at centre, pipColor@0.85 at the rim) plus a small
  // upper-left highlight arc, so it reads as a drilled, slightly concave dot.
  const pip = (cx: number, cy: number, r: number) => {
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    gradient.addColorStop(0, pipColor)
    gradient.addColorStop(1, `rgba(${pr},${pg},${pb},0.85)`)
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(cx, cy, r - 1, Math.PI * 1.05, Math.PI * 1.55)
    ctx.stroke()
  }

  const pipRadius = 13
  // Top half: six pips, two columns × three rows.
  for (const x of [faceX0 + 0.32 * w, faceX0 + 0.68 * w]) {
    for (const y of [faceY0 + 0.12 * h, faceY0 + 0.25 * h, faceY0 + 0.38 * h]) pip(x, y, pipRadius)
  }
  // Bottom half: three pips along a diagonal.
  for (const [x, y] of [
    [faceX0 + 0.3 * w, faceY0 + 0.62 * h],
    [faceX0 + 0.5 * w, faceY0 + 0.75 * h],
    [faceX0 + 0.7 * w, faceY0 + 0.88 * h],
  ] as const) {
    pip(x, y, pipRadius)
  }

  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.needsUpdate = true
  pipTextureCache.set(pipColor, tex)
  return tex
}

// -------------------------------------------------------------------------------------------
// Material set

function buildMaterials(theme: ChapterTheme, quality: QualityTier): Record<MaterialKey, THREE.Material> {
  const wood = woodGrainTexture()

  const marble: THREE.Material =
    quality === 'low'
      ? new THREE.MeshStandardMaterial({
          color: '#dce8f2',
          transparent: true,
          opacity: 0.85,
          roughness: 0.15,
          metalness: 0,
        })
      : new THREE.MeshPhysicalMaterial({
          color: '#eaf4fb',
          transmission: 0.9,
          ior: 1.5,
          thickness: 2,
          roughness: 0.05,
          metalness: 0,
          attenuationColor: '#bfe0f5',
          attenuationDistance: 4,
        })

  return {
    // Per-instance colour carries the actual body tone (theme.dominoBody), so the base colour is
    // neutral white; see PiecesView's InstancedMesh setColorAt. Instance colours need no
    // `vertexColors` (that would multiply by a missing colour attribute and render black).
    domino: new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      roughness: 0.32,
      metalness: 0,
      sheen: 0.15,
      sheenColor: '#fff4dc',
      envMapIntensity: 1.1,
    }),
    dominoTall: new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      roughness: 0.32,
      metalness: 0,
      sheen: 0.15,
      sheenColor: '#fff4dc',
      envMapIntensity: 1.1,
    }),
    wood: new THREE.MeshStandardMaterial({ map: wood, color: '#c99a6b', roughness: 0.6, metalness: 0 }),
    woodDark: new THREE.MeshStandardMaterial({ map: wood, color: '#5a4030', roughness: 0.65, metalness: 0 }),
    metal: new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.35, metalness: 0.9 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.9, metalness: 0 }),
    marble,
    brass: new THREE.MeshStandardMaterial({ color: '#c9a24a', roughness: 0.3, metalness: 1 }),
    cloth: new THREE.MeshStandardMaterial({ color: theme.table.insetColor, roughness: 0.95, metalness: 0 }),
    plastic: new THREE.MeshPhysicalMaterial({ color: theme.accent, clearcoat: 1, clearcoatRoughness: 0.15, roughness: 0.3, metalness: 0 }),
    spring: new THREE.MeshStandardMaterial({ color: '#c0392b', roughness: 0.75, metalness: 0 }),
    star: new THREE.MeshStandardMaterial({
      color: '#e8c04a',
      emissive: '#ffcc33',
      emissiveIntensity: 0.35,
      roughness: 0.3,
      metalness: 0.85,
    }),
    goal: new THREE.MeshStandardMaterial({
      color: '#e03131',
      emissive: '#ff4d4d',
      emissiveIntensity: 0,
      roughness: 0.4,
      metalness: 0.05,
    }),
  }
}

/**
 * The full themed MaterialKey set for a chapter, memoised and disposed on change. `quality`
 * (default 'high') controls the marble fallback: on 'low' it swaps physically-based transmission
 * for a cheap translucent MeshStandardMaterial.
 */
export function useThemeMaterials(chapter: ChapterId, quality: QualityTier = 'high'): Record<MaterialKey, THREE.Material> {
  const theme = THEMES[chapter]
  const materials = useMemo(() => buildMaterials(theme, quality), [theme, quality])
  useEffect(() => {
    return () => {
      for (const material of Object.values(materials)) material.dispose()
    }
  }, [materials])
  return materials
}
