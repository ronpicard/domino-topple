/*
 * The tabletop diorama itself: table slab + playable surface, soft out-of-focus surroundings, a
 * warm gradient backdrop, chapter dressing props, and the chapter's lighting rig. No game state:
 * purely themed by `chapter` and tuned by `quality`.
 */

import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Environment, Lightformer } from '@react-three/drei'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { THEMES } from './themes.ts'
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
      <Backdrop topColor={theme.background.top} bottomColor={theme.background.bottom} />
      <fog attach="fog" args={[theme.fog.color, theme.fog.near, theme.fog.far]} />

      <Floor />
      <Table width={width} depth={depth} theme={theme} chapter={chapter} />
      <ChapterProps chapter={chapter} width={width} depth={depth} theme={theme} />

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

function Backdrop({ topColor, bottomColor }: { topColor: string; bottomColor: string }) {
  const radius = 1600
  const geometry = useMemo(() => {
    const geo = new THREE.SphereGeometry(radius, 32, 24)
    const position = geo.attributes.position
    const colors = new Float32Array(position.count * 3)
    const top = new THREE.Color(topColor)
    const bottom = new THREE.Color(bottomColor)
    const mixed = new THREE.Color()
    for (let i = 0; i < position.count; i++) {
      const t = THREE.MathUtils.clamp(position.getY(i) / radius * 0.5 + 0.5, 0, 1)
      mixed.copy(bottom).lerp(top, t)
      colors[i * 3] = mixed.r
      colors[i * 3 + 1] = mixed.g
      colors[i * 3 + 2] = mixed.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return geo
  }, [topColor, bottomColor])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh geometry={geometry} renderOrder={-1000}>
      <meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} toneMapped={false} depthWrite={false} />
    </mesh>
  )
}

function Floor() {
  return (
    <mesh position={[0, -60, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[900, 48]} />
      <meshStandardMaterial color="#1b140f" roughness={1} />
    </mesh>
  )
}

function Table({ width, depth, theme, chapter }: { width: number; depth: number; theme: (typeof THEMES)[ChapterId]; chapter: ChapterId }) {
  const slabGeometry = useMemo(
    () => new RoundedBoxGeometry(width + TABLE_BORDER * 2, TABLE_THICKNESS, depth + TABLE_BORDER * 2, 3, 1.4),
    [width, depth],
  )
  useEffect(() => () => slabGeometry.dispose(), [slabGeometry])

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

function ChapterProps({ chapter, width, depth, theme }: { chapter: ChapterId; width: number; depth: number; theme: (typeof THEMES)[ChapterId] }) {
  const edgeX = width / 2 + TABLE_BORDER * 0.6
  const edgeZ = depth / 2 + TABLE_BORDER * 0.6

  if (chapter === 'desk') {
    return (
      <group>
        <group position={[-edgeX + 4, 0, -edgeZ + 6]} rotation={[0, 0.5, Math.PI / 2 - 0.15]}>
          <mesh castShadow position={[0, 0, 0]}>
            <cylinderGeometry args={[0.5, 0.5, 12, 10]} />
            <meshStandardMaterial color="#e8b23a" roughness={0.6} />
          </mesh>
          <mesh castShadow position={[0, 6.2, 0]}>
            <coneGeometry args={[0.5, 1.2, 10]} />
            <meshStandardMaterial color="#3a2a1a" roughness={0.8} />
          </mesh>
        </group>
        <group position={[edgeX - 6, 0, edgeZ - 8]}>
          <mesh castShadow receiveShadow position={[0, 2.2, 0]}>
            <cylinderGeometry args={[2.4, 2.4, 4.4, 20]} />
            <meshPhysicalMaterial color="#f4ecd8" roughness={0.25} clearcoat={0.8} />
          </mesh>
          <mesh castShadow position={[2.6, 2.2, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[1.1, 0.3, 10, 20]} />
            <meshPhysicalMaterial color="#f4ecd8" roughness={0.25} clearcoat={0.8} />
          </mesh>
        </group>
      </group>
    )
  }

  if (chapter === 'workshop') {
    return (
      <group>
        <mesh position={[0, 20, -edgeZ - 2]} receiveShadow>
          <boxGeometry args={[width + TABLE_BORDER * 2, 40, 1]} />
          <meshStandardMaterial color={theme.table.insetColor} roughness={0.9} />
        </mesh>
        <group position={[edgeX - 5, 0.6, -edgeZ + 6]} rotation={[0, 0.3, 0]}>
          <mesh castShadow>
            <boxGeometry args={[6, 0.4, 1.1]} />
            <meshStandardMaterial color="#9aa2a8" metalness={0.85} roughness={0.3} />
          </mesh>
        </group>
      </group>
    )
  }

  return (
    <group>
      <group position={[-edgeX + 4, 1.5, edgeZ - 4]}>
        <mesh castShadow>
          <boxGeometry args={[3, 3, 3]} />
          <meshPhysicalMaterial color="#ff6b6b" roughness={0.3} clearcoat={1} />
        </mesh>
        <mesh castShadow position={[3.4, -0.6, 0.6]}>
          <boxGeometry args={[2.4, 2.4, 2.4]} />
          <meshPhysicalMaterial color="#4dabf7" roughness={0.3} clearcoat={1} />
        </mesh>
      </group>
      <mesh castShadow position={[edgeX - 5, 2, -edgeZ + 5]}>
        <sphereGeometry args={[2, 24, 20]} />
        <meshPhysicalMaterial color="#ffe066" roughness={0.25} clearcoat={1} />
      </mesh>
    </group>
  )
}

