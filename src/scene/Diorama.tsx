/*
 * The tabletop diorama itself: table slab + playable surface, the room around it, the chapter's
 * dressing props, and its lighting rig. No game state: purely themed by `chapter` and tuned by
 * `quality`.
 */

import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Environment, Lightformer } from '@react-three/drei'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { THEMES } from './themes.ts'
import { woodGrainTexture } from './materials.ts'
import { Room } from './props/Room.tsx'
import { DeskProps } from './props/DeskProps.tsx'
import { WorkshopProps } from './props/WorkshopProps.tsx'
import { PlayroomProps } from './props/PlayroomProps.tsx'
import type { ChapterId, LevelDef, QualityTier } from '../game/types.ts'

export interface DioramaProps {
  level: LevelDef
  chapter: ChapterId
  quality: QualityTier
}

const TABLE_BORDER = 8
const TABLE_THICKNESS = 4
const SHADOW_MARGIN = 20

export function Diorama({ level, chapter, quality }: DioramaProps) {
  const theme = THEMES[chapter]
  const { width, depth } = level.table
  const mapSize = quality === 'high' ? 2048 : quality === 'medium' ? 1024 : 512
  const halfW = width / 2 + SHADOW_MARGIN
  const halfD = depth / 2 + SHADOW_MARGIN

  return (
    <group>
      <color attach="background" args={[theme.fog.color]} />
      <fog attach="fog" args={[theme.fog.color, theme.fog.near, theme.fog.far]} />

      <Room colors={theme.room} />
      <Table width={width} depth={depth} theme={theme} chapter={chapter} />
      {chapter === 'desk' && <DeskProps width={width} depth={depth} />}
      {chapter === 'workshop' && <WorkshopProps width={width} depth={depth} />}
      {chapter === 'playroom' && <PlayroomProps width={width} depth={depth} />}

      <hemisphereLight args={[theme.hemisphere.sky, theme.hemisphere.ground, 1.3]} />
      <ambientLight color={theme.ambient} intensity={0.2} />
      <directionalLight
        color={theme.keyLight.color}
        intensity={theme.keyLight.intensity}
        position={[halfW * 0.5 + 30, 150, halfD * 0.6 + 40]}
        castShadow
        shadow-mapSize={[mapSize, mapSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      >
        <orthographicCamera attach="shadow-camera" args={[-halfW, halfW, halfD, -halfD, 1, 600]} />
      </directionalLight>
      <directionalLight color="#dfe9ff" intensity={0.35} position={[-halfW * 0.6, 90, -halfD * 0.4]} />

      <Environment resolution={64} environmentIntensity={0.9}>
        <Lightformer form="rect" color={theme.keyLight.color} intensity={4} position={[0, 60, -halfD]} scale={[Math.max(width, 40), 60, 1]} />
        <Lightformer form="ring" color="#ffffff" intensity={3} position={[-halfW, 50, halfD * 0.5]} scale={24} />
        <Lightformer form="rect" color={theme.hemisphere.ground} intensity={0.8} rotation={[-Math.PI / 2, 0, 0]} position={[0, -30, 0]} scale={[Math.max(width, depth) * 1.4, Math.max(width, depth) * 1.4, 1]} />
      </Environment>
    </group>
  )
}

function Table({ width, depth, theme, chapter }: { width: number; depth: number; theme: (typeof THEMES)[ChapterId]; chapter: ChapterId }) {
  const slabGeometry = useMemo(
    () => new RoundedBoxGeometry(width + TABLE_BORDER * 2, TABLE_THICKNESS, depth + TABLE_BORDER * 2, 3, 1.4),
    [width, depth],
  )
  useEffect(() => () => slabGeometry.dispose(), [slabGeometry])

  const wood = useMemo(() => (chapter === 'desk' ? woodGrainTexture() : null), [chapter])
  const surfaceTexture = useMemo(
    () => (chapter === 'playroom' ? buildCheckerTexture(theme.table.color, theme.table.insetColor) : null),
    [chapter, theme],
  )
  useEffect(() => () => surfaceTexture?.dispose(), [surfaceTexture])

  return (
    <group>
      <mesh geometry={slabGeometry} position={[0, -TABLE_THICKNESS / 2, 0]} receiveShadow castShadow>
        {theme.table.kind === 'metalBench' ? (
          <meshStandardMaterial color={theme.tableEdge} metalness={theme.table.metalness} roughness={0.4} />
        ) : wood ? (
          <meshPhysicalMaterial map={wood} color="#5a3018" roughness={0.35} clearcoat={0.7} clearcoatRoughness={0.25} />
        ) : (
          <meshPhysicalMaterial color={theme.tableEdge} roughness={0.4} clearcoat={0.5} clearcoatRoughness={0.3} />
        )}
      </mesh>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow userData={{ support: true }}>
        <planeGeometry args={[width, depth]} />
        {chapter === 'playroom' ? (
          <meshPhysicalMaterial map={surfaceTexture} roughness={theme.table.roughness} clearcoat={0.9} clearcoatRoughness={0.2} />
        ) : chapter === 'desk' ? (
          <meshStandardMaterial color={theme.table.insetColor} roughness={theme.table.insetRoughness} />
        ) : (
          <meshStandardMaterial color={theme.table.color} metalness={theme.table.metalness} roughness={theme.table.roughness} />
        )}
      </mesh>
    </group>
  )
}

function buildCheckerTexture(colorA: string, colorB: string): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const cells = 8
    const cellSize = size / cells
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? colorA : colorB
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize)
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
