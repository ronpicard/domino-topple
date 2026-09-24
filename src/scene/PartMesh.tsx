/*
 * One rigid part of a piece, hand-built from primitives keyed by PartDef.visual so the scene reads
 * as a warm toy diorama rather than raw collider boxes. Renders as a <group> positioned at
 * partWorldPose; PiecesView drives the group's own transform imperatively for dynamic bodies
 * during a run (see its ref usage). Geometry mirrors each collider's own offset/rotation, in the
 * part's local frame, so what you see always matches what falls over.
 */

import { forwardRef, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { PIECES, partWorldPose } from '../game/pieces.ts'
import type { MaterialKey, PartDef, PartShape, PlacedPiece, Quat, Vec3 } from '../game/types.ts'
import { dominoPipTexture } from './materials.ts'

export interface PartMeshProps {
  piece: PlacedPiece
  partIndex: number
  materials: Record<MaterialKey, THREE.Material>
  ghost?: boolean
  invalid?: boolean
  selected?: boolean
}

const IDENTITY: Quat = [0, 0, 0, 1]
const DEFAULT_PIP_COLOR = '#1c1712'

const GHOST_VALID = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false })
const GHOST_INVALID = new THREE.MeshBasicMaterial({ color: '#ff4d4d', transparent: true, opacity: 0.45, depthWrite: false })
const SELECT_OUTLINE = new THREE.MeshBasicMaterial({ color: '#e8590c', side: THREE.BackSide, transparent: true, opacity: 0.9 })

/** Small bevel radius for a decorative box (no physics rounding requested), clamped to fit. */
function cosmeticRadius(half: Vec3): number {
  return Math.max(0, Math.min(0.4, half[0], half[1], half[2]) * 0.6)
}

function boxGeometry(half: Vec3, physicsRadius?: number): THREE.BufferGeometry {
  const radius = physicsRadius && physicsRadius > 0 ? physicsRadius : cosmeticRadius(half)
  if (radius > 0.01) return new RoundedBoxGeometry(2 * half[0], 2 * half[1], 2 * half[2], 2, radius)
  return new THREE.BoxGeometry(2 * half[0], 2 * half[1], 2 * half[2])
}

function shapeGeometry(shape: PartShape): THREE.BufferGeometry {
  switch (shape.type) {
    case 'box':
      return boxGeometry(shape.half, shape.radius)
    case 'ball':
      return new THREE.SphereGeometry(shape.radius, 32, 24)
    case 'cylinder':
      return new THREE.CylinderGeometry(shape.radius, shape.radius, shape.halfHeight * 2, 24)
    case 'hull':
      return new ConvexGeometry(shape.points.map(([x, y, z]) => new THREE.Vector3(x, y, z)))
  }
}

/** A 5-point star outline, radius `r`, used to emboss the star token's faces. */
function starShape(r: number): THREE.Shape {
  const shape = new THREE.Shape()
  const inner = r * 0.45
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : inner
    const angle = (i / 10) * Math.PI * 2 - Math.PI / 2
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  return shape
}

interface UD {
  pieceId: string
  partIndex: number
}

export const PartMesh = forwardRef<THREE.Group, PartMeshProps>(function PartMesh(
  { piece, partIndex, materials, ghost = false, invalid = false, selected = false },
  ref,
) {
  const part = PIECES[piece.kind].parts[partIndex]
  const pose = useMemo(() => partWorldPose(piece, part), [piece, part])
  const ud = useMemo<UD>(() => ({ pieceId: piece.id, partIndex }), [piece.id, partIndex])

  const shadow = !ghost
  const mat = (key: MaterialKey): THREE.Material => (ghost ? (invalid ? GHOST_INVALID : GHOST_VALID) : materials[key])

  if (part.sensor) {
    // Sensor-only parts (goal / spring triggers) render nothing; the pad or bell body is drawn by
    // its sibling part.
    return <group ref={ref} position={pose.position} quaternion={pose.rotation} userData={ud} />
  }

  return (
    <group ref={ref} position={pose.position} quaternion={pose.rotation} userData={ud}>
      <PartVisual part={part} material={mat(part.material)} ud={ud} shadow={shadow} selected={selected && !ghost} />
    </group>
  )
})

function Outline({ geometry }: { geometry: THREE.BufferGeometry }) {
  return <mesh geometry={geometry} material={SELECT_OUTLINE} scale={1.06} />
}

function ColliderMesh({
  shape,
  offset,
  rotation,
  material,
  ud,
  shadow,
  outline,
}: {
  shape: PartShape
  offset?: Vec3
  rotation?: Quat
  material: THREE.Material
  ud: UD
  shadow: boolean
  outline?: boolean
}) {
  const geometry = useMemo(() => shapeGeometry(shape), [shape])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={offset ?? [0, 0, 0]}
      quaternion={rotation ?? IDENTITY}
      userData={ud}
      castShadow={shadow}
      receiveShadow={shadow}
    >
      {outline && <Outline geometry={geometry} />}
    </mesh>
  )
}

/** Fallback: draw every collider of the part faithfully, all in the part's one material. */
function ColliderFallback({ part, material, ud, shadow }: { part: PartDef; material: THREE.Material; ud: UD; shadow: boolean }) {
  return (
    <>
      {part.colliders.map((c, i) => (
        <ColliderMesh
          key={i}
          shape={c.shape}
          offset={c.offset}
          rotation={c.rotation}
          material={material}
          ud={ud}
          shadow={shadow}
          outline={i === 0}
        />
      ))}
    </>
  )
}

function PartVisual({
  part,
  material,
  ud,
  shadow,
  selected,
}: {
  part: PartDef
  material: THREE.Material
  ud: UD
  shadow: boolean
  selected: boolean
}) {
  switch (part.visual) {
    case 'domino':
      return <DominoVisual part={part} material={material} ud={ud} shadow={shadow} selected={selected} />
    case 'marble':
      return <MarbleVisual part={part} material={material} ud={ud} shadow={shadow} selected={selected} />
    case 'star':
      return <StarVisual part={part} material={material} ud={ud} shadow={shadow} selected={selected} />
    case 'bell':
      return <BellVisual part={part} material={material} ud={ud} shadow={shadow} selected={selected} />
    case 'flag':
      return <FlagVisual part={part} material={material} ud={ud} shadow={shadow} selected={selected} />
    case 'spring':
      return <SpringVisual part={part} material={material} ud={ud} shadow={shadow} selected={selected} />
    case 'car':
      return <CarVisual part={part} material={material} ud={ud} shadow={shadow} selected={selected} />
    case 'pendulumArm':
      return <PendulumArmVisual part={part} material={material} ud={ud} shadow={shadow} selected={selected} />
    // 'ramp' / 'chute' / 'stairs' / 'fulcrum' / 'plank' / 'bridge' / 'pendulumFrame' / 'cup' /
    // 'block' / 'platform' already carry faithful, correctly-sized collider geometry (rounded
    // boxes / convex hulls) — the fallback IS the intended look for these.
    default:
      return <ColliderFallback part={part} material={material} ud={ud} shadow={shadow} />
  }
}

function MarbleVisual({ part, material, ud, shadow, selected }: { part: PartDef; material: THREE.Material; ud: UD; shadow: boolean; selected: boolean }) {
  const shape = part.colliders[0]?.shape
  const radius = shape && shape.type === 'ball' ? shape.radius : 1.5
  const geometry = useMemo(() => new THREE.SphereGeometry(radius, 32, 32), [radius])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} material={material} userData={ud} castShadow={shadow} receiveShadow={shadow}>
      {selected && <Outline geometry={geometry} />}
    </mesh>
  )
}

function DominoVisual({ part, material, ud, shadow, selected }: { part: PartDef; material: THREE.Material; ud: UD; shadow: boolean; selected: boolean }) {
  const shape = part.colliders[0]?.shape
  const half: Vec3 = shape && shape.type === 'box' ? shape.half : [0.6, 4, 2]
  const radius = shape && shape.type === 'box' ? shape.radius : undefined
  const bodyGeometry = useMemo(() => boxGeometry(half, radius), [half, radius])
  const pipTexture = useMemo(() => dominoPipTexture(DEFAULT_PIP_COLOR), [])
  const pipGeometry = useMemo(() => new THREE.PlaneGeometry(half[2] * 1.5, half[1] * 1.5), [half])
  const pipMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ map: pipTexture, transparent: true, alphaTest: 0.5, roughness: 0.6 }),
    [pipTexture],
  )
  useEffect(() => () => {
    bodyGeometry.dispose()
    pipGeometry.dispose()
    pipMaterial.dispose()
  }, [bodyGeometry, pipGeometry, pipMaterial])
  return (
    <>
      <mesh geometry={bodyGeometry} material={material} userData={ud} castShadow={shadow} receiveShadow={shadow}>
        {selected && <Outline geometry={bodyGeometry} />}
      </mesh>
      <mesh geometry={pipGeometry} material={pipMaterial} position={[half[0] + 0.01, 0, 0]} rotation={[0, Math.PI / 2, 0]} userData={ud} />
      <mesh geometry={pipGeometry} material={pipMaterial} position={[-half[0] - 0.01, 0, 0]} rotation={[0, -Math.PI / 2, 0]} userData={ud} />
    </>
  )
}

function StarVisual({ part, material, ud, shadow, selected }: { part: PartDef; material: THREE.Material; ud: UD; shadow: boolean; selected: boolean }) {
  const shape = part.colliders[0]?.shape
  const radius = shape && shape.type === 'cylinder' ? shape.radius : 2.2
  const halfHeight = shape && shape.type === 'cylinder' ? shape.halfHeight : 0.3
  const coinGeometry = useMemo(() => new THREE.CylinderGeometry(radius, radius, halfHeight * 2, 32), [radius, halfHeight])
  const starGeometry = useMemo(() => {
    const geo = new THREE.ExtrudeGeometry(starShape(radius * 0.7), { depth: 0.08, bevelEnabled: false })
    geo.rotateX(-Math.PI / 2)
    geo.translate(0, halfHeight + 0.04, 0)
    return geo
  }, [radius, halfHeight])
  const emboss = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fff3c4', roughness: 0.25, metalness: 0.9 }), [])
  useEffect(() => () => {
    coinGeometry.dispose()
    starGeometry.dispose()
    emboss.dispose()
  }, [coinGeometry, starGeometry, emboss])
  return (
    <>
      <mesh geometry={coinGeometry} material={material} userData={ud} castShadow={shadow} receiveShadow={shadow}>
        {selected && <Outline geometry={coinGeometry} />}
      </mesh>
      <mesh geometry={starGeometry} material={emboss} userData={ud} castShadow={shadow} />
      <mesh geometry={starGeometry} material={emboss} rotation={[Math.PI, 0, 0]} userData={ud} castShadow={shadow} />
    </>
  )
}

function BellVisual({ part, material, ud, shadow, selected }: { part: PartDef; material: THREE.Material; ud: UD; shadow: boolean; selected: boolean }) {
  const bellCollider = part.colliders.find((c) => c.shape.type === 'cylinder')
  const shape = bellCollider?.shape
  const radius = shape && shape.type === 'cylinder' ? shape.radius : 3
  const halfHeight = shape && shape.type === 'cylinder' ? shape.halfHeight : 3.5
  const geometry = useMemo(() => {
    const points: THREE.Vector2[] = []
    const h = halfHeight * 2
    // Profile from the flared mouth (bottom, outer) up to the crown on the axis.
    points.push(new THREE.Vector2(radius * 0.86, 0))
    points.push(new THREE.Vector2(radius, h * 0.04))
    points.push(new THREE.Vector2(radius * 0.93, h * 0.14))
    points.push(new THREE.Vector2(radius * 0.72, h * 0.38))
    points.push(new THREE.Vector2(radius * 0.62, h * 0.62))
    points.push(new THREE.Vector2(radius * 0.52, h * 0.82))
    points.push(new THREE.Vector2(radius * 0.3, h * 0.95))
    points.push(new THREE.Vector2(0, h))
    return new THREE.LatheGeometry(points, 28)
  }, [radius, halfHeight])
  const stand = useMemo(() => new THREE.BoxGeometry(0.5, 0.5, radius * 1.4), [radius])
  useEffect(() => () => {
    geometry.dispose()
    stand.dispose()
  }, [geometry, stand])
  return (
    <group position={[0, -halfHeight, 0]}>
      <mesh geometry={geometry} material={material} userData={ud} castShadow={shadow} receiveShadow={shadow}>
        {selected && <Outline geometry={geometry} />}
      </mesh>
      <mesh geometry={stand} material={material} position={[0, halfHeight * 1.9, -radius * 0.3]} userData={ud} castShadow={shadow} />
    </group>
  )
}

function FlagVisual({ part, material, ud, shadow, selected }: { part: PartDef; material: THREE.Material; ud: UD; shadow: boolean; selected: boolean }) {
  const baseCollider = part.colliders.find((c) => c.shape.type === 'cylinder')
  const baseShape = baseCollider?.shape
  const baseRadius = baseShape && baseShape.type === 'cylinder' ? baseShape.radius : 2
  const baseHalf = baseShape && baseShape.type === 'cylinder' ? baseShape.halfHeight : 0.4
  const poleCollider = part.colliders.find((c) => c.shape.type === 'box')
  const poleOffset: Vec3 = poleCollider?.offset ?? [0, 7.4, 0]
  const poleHalf = poleCollider && poleCollider.shape.type === 'box' ? poleCollider.shape.half : [0.3, 7, 0.3]

  const baseGeometry = useMemo(() => new THREE.CylinderGeometry(baseRadius, baseRadius * 1.05, baseHalf * 2, 24), [baseRadius, baseHalf])
  const poleGeometry = useMemo(() => new THREE.CylinderGeometry(poleHalf[0], poleHalf[0], poleHalf[1] * 2, 12), [poleHalf])
  const pennantGeometry = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(0, 0)
    shape.lineTo(3.2, -1.3)
    shape.lineTo(0, -2.6)
    shape.closePath()
    return new THREE.ShapeGeometry(shape)
  }, [])
  useEffect(() => () => {
    baseGeometry.dispose()
    poleGeometry.dispose()
    pennantGeometry.dispose()
  }, [baseGeometry, poleGeometry, pennantGeometry])
  return (
    <group>
      <mesh geometry={baseGeometry} material={material} userData={ud} castShadow={shadow} receiveShadow={shadow}>
        {selected && <Outline geometry={baseGeometry} />}
      </mesh>
      <mesh geometry={poleGeometry} material={material} position={poleOffset} userData={ud} castShadow={shadow} />
      <mesh
        geometry={pennantGeometry}
        material={material}
        position={[poleOffset[0] + poleHalf[0], poleOffset[1] + poleHalf[1] * 0.55, poleOffset[2]]}
        userData={ud}
        castShadow={shadow}
      />
    </group>
  )
}

function SpringVisual({ part, material, ud, shadow, selected }: { part: PartDef; material: THREE.Material; ud: UD; shadow: boolean; selected: boolean }) {
  const padCollider = part.colliders.find((c) => c.shape.type === 'box')
  const padShape = padCollider?.shape
  const padHalf: Vec3 = padShape && padShape.type === 'box' ? padShape.half : [3, 0.5, 3]
  const padGeometry = useMemo(() => boxGeometry(padHalf, 0.2), [padHalf])
  const coilGeometry = useMemo(() => {
    const topY = padHalf[1] * 2 + 1.2
    const curve = new THREE.CatmullRomCurve3(
      Array.from({ length: 24 }, (_, i) => {
        const t = i / 23
        const angle = t * Math.PI * 5
        const r = padHalf[0] * 0.5
        return new THREE.Vector3(Math.cos(angle) * r, t * topY, Math.sin(angle) * r)
      }),
    )
    return new THREE.TubeGeometry(curve, 64, 0.3, 8, false)
  }, [padHalf])
  const topGeometry = useMemo(() => new THREE.CylinderGeometry(padHalf[0] * 0.55, padHalf[0] * 0.55, 0.5, 16), [padHalf])
  const topMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c0392b', roughness: 0.7 }), [])
  useEffect(() => () => {
    padGeometry.dispose()
    coilGeometry.dispose()
    topGeometry.dispose()
    topMaterial.dispose()
  }, [padGeometry, coilGeometry, topGeometry, topMaterial])
  return (
    <group>
      <mesh geometry={padGeometry} material={material} userData={ud} castShadow={shadow} receiveShadow={shadow}>
        {selected && <Outline geometry={padGeometry} />}
      </mesh>
      <mesh geometry={coilGeometry} material={material} userData={ud} castShadow={shadow} />
      <mesh geometry={topGeometry} material={topMaterial} position={[0, padHalf[1] * 2 + 1.2, 0]} userData={ud} castShadow={shadow} />
    </group>
  )
}

function CarVisual({ part, material, ud, shadow, selected }: { part: PartDef; material: THREE.Material; ud: UD; shadow: boolean; selected: boolean }) {
  const bodyCollider = part.colliders.find((c) => c.shape.type === 'box')
  const shape = bodyCollider?.shape
  const half: Vec3 = shape && shape.type === 'box' ? shape.half : [4, 1.5, 2.5]
  const radius = shape && shape.type === 'box' ? shape.radius : 0.5
  const bodyGeometry = useMemo(() => boxGeometry(half, radius), [half, radius])
  const cabinGeometry = useMemo(() => new RoundedBoxGeometry(half[0] * 0.9, half[1] * 1.1, half[2] * 1.7, 2, 0.3), [half])
  const wheelGeometry = useMemo(() => new THREE.CylinderGeometry(half[1] * 0.6, half[1] * 0.6, 0.5, 20), [half])
  const wheelMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1c1c1c', roughness: 0.8 }), [])
  const cabinMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.55, roughness: 0.1 }), [])
  useEffect(() => () => {
    bodyGeometry.dispose()
    cabinGeometry.dispose()
    wheelGeometry.dispose()
    wheelMaterial.dispose()
    cabinMaterial.dispose()
  }, [bodyGeometry, cabinGeometry, wheelGeometry, wheelMaterial, cabinMaterial])
  const wheelZ = half[2] * 0.85
  const wheelX = half[0] * 0.55
  const wheelY = -half[1] * 0.55
  return (
    <group>
      <mesh geometry={bodyGeometry} material={material} userData={ud} castShadow={shadow} receiveShadow={shadow}>
        {selected && <Outline geometry={bodyGeometry} />}
      </mesh>
      <mesh geometry={cabinGeometry} material={cabinMaterial} position={[-half[0] * 0.1, half[1] * 0.75, 0]} userData={ud} castShadow={shadow} />
      {[
        [wheelX, wheelY, wheelZ],
        [wheelX, wheelY, -wheelZ],
        [-wheelX, wheelY, wheelZ],
        [-wheelX, wheelY, -wheelZ],
      ].map((p, i) => (
        <mesh key={i} geometry={wheelGeometry} material={wheelMaterial} position={p as Vec3} rotation={[Math.PI / 2, 0, 0]} userData={ud} castShadow={shadow} />
      ))}
    </group>
  )
}

function PendulumArmVisual({ part, material, ud, shadow, selected }: { part: PartDef; material: THREE.Material; ud: UD; shadow: boolean; selected: boolean }) {
  const rod = part.colliders[0]
  const head = part.colliders[1]
  const rodShape = rod?.shape
  const rodHalf: Vec3 = rodShape && rodShape.type === 'box' ? rodShape.half : [0.4, 8.5, 0.4]
  const headShape = head?.shape
  const headHalf: Vec3 = headShape && headShape.type === 'box' ? headShape.half : [1.5, 2, 2.5]
  const rodGeometry = useMemo(() => new THREE.CylinderGeometry(rodHalf[0], rodHalf[0], rodHalf[1] * 2, 12), [rodHalf])
  const headGeometry = useMemo(() => boxGeometry(headHalf, 0.2), [headHalf])
  useEffect(() => () => {
    rodGeometry.dispose()
    headGeometry.dispose()
  }, [rodGeometry, headGeometry])
  return (
    <group>
      <mesh geometry={rodGeometry} material={material} position={rod?.offset ?? [0, -9.5, 0]} userData={ud} castShadow={shadow}>
        {selected && <Outline geometry={rodGeometry} />}
      </mesh>
      <mesh geometry={headGeometry} material={material} position={head?.offset ?? [0, -19, 0]} userData={ud} castShadow={shadow} />
    </group>
  )
}
