/*
 * Playroom chapter dressing: wooden alphabet blocks, a toy car, a rubber ball, and a crayon
 * box on the slab border, plus a teddy bear, a toy train on its track, a stacking rings
 * tower, a round rug, bunting, and wall stars filling out the room floor and back wall.
 */

import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { ROOM_FLOOR_Y, ROOM_RADIUS } from './Room.tsx'

const FLOOR_Y = ROOM_FLOOR_Y
const WALL_RADIUS = ROOM_RADIUS - 10

const PALETTE = {
  red: '#ff6b6b',
  orange: '#ffb84d',
  yellow: '#ffe066',
  green: '#6bd66b',
  blue: '#4dabf7',
  purple: '#b197fc',
  pink: '#f8a5c2',
  cream: '#fff4e0',
  honey: '#d9a066',
  teddy: '#b97a4b',
} as const

interface PlasticMaterials {
  red: THREE.MeshPhysicalMaterial
  orange: THREE.MeshPhysicalMaterial
  yellow: THREE.MeshPhysicalMaterial
  green: THREE.MeshPhysicalMaterial
  blue: THREE.MeshPhysicalMaterial
  purple: THREE.MeshPhysicalMaterial
  pink: THREE.MeshPhysicalMaterial
  cream: THREE.MeshPhysicalMaterial
}

interface SoftMaterials {
  honey: THREE.MeshStandardMaterial
  teddy: THREE.MeshStandardMaterial
  cream: THREE.MeshStandardMaterial
  black: THREE.MeshStandardMaterial
}

function usePlasticMaterials(): PlasticMaterials {
  const materials = useMemo<PlasticMaterials>(() => {
    const make = (color: string) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 })
    return {
      red: make(PALETTE.red),
      orange: make(PALETTE.orange),
      yellow: make(PALETTE.yellow),
      green: make(PALETTE.green),
      blue: make(PALETTE.blue),
      purple: make(PALETTE.purple),
      pink: make(PALETTE.pink),
      cream: make(PALETTE.cream),
    }
  }, [])

  useEffect(() => () => {
    for (const material of Object.values(materials)) material.dispose()
  }, [materials])

  return materials
}

function useSoftMaterials(): SoftMaterials {
  const materials = useMemo<SoftMaterials>(() => ({
    honey: new THREE.MeshStandardMaterial({ color: PALETTE.honey, roughness: 0.9 }),
    teddy: new THREE.MeshStandardMaterial({ color: PALETTE.teddy, roughness: 0.9 }),
    cream: new THREE.MeshStandardMaterial({ color: PALETTE.cream, roughness: 0.9 }),
    black: new THREE.MeshStandardMaterial({ color: '#1f1f1f', roughness: 0.9 }),
  }), [])

  useEffect(() => () => {
    for (const material of Object.values(materials)) material.dispose()
  }, [materials])

  return materials
}

function polarPosition(angle: number, radius: number): [number, number, number] {
  return [radius * Math.sin(angle), FLOOR_Y, radius * Math.cos(angle)]
}

function buildLetterTexture(letter: string, backgroundColor: string, letterColor: string): THREE.CanvasTexture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, size, size)
    ctx.fillStyle = letterColor
    ctx.font = 'bold 44px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(letter, size / 2, size / 2 + 2)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function buildStarShape(): THREE.Shape {
  const shape = new THREE.Shape()
  const points = 5
  const outer = 10
  const inner = 4.5
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner
    const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  return shape
}

function buntingCurve(t: number): [number, number, number] {
  const x = THREE.MathUtils.lerp(-200, 200, t)
  const sag = 30 * 4 * t * (1 - t)
  return [x, 120 - sag, -(ROOM_RADIUS - 60)]
}

export function PlayroomProps({ width, depth }: { width: number; depth: number }) {
  const plastic = usePlasticMaterials()
  const soft = useSoftMaterials()
  const edgeX = width / 2 + 4
  const edgeZ = depth / 2 + 4
  const roomRadius = Math.max(width, depth) / 2

  return (
    <group>
      <AlphabetBlocks position={[-edgeX + 4, 0, -edgeZ + 4]} soft={soft} />
      <ToyCar position={[edgeX - 6, 0, edgeZ - 5]} plastic={plastic} soft={soft} />
      <RubberBall position={[edgeX - 5, 2.4, -edgeZ + 5]} plastic={plastic} />
      <CrayonBox position={[-edgeX + 5, 0, edgeZ - 5]} plastic={plastic} />
      <TeddyBear angle={0.7} radius={roomRadius + 70} soft={soft} plastic={plastic} />
      <ToyTrain angle={-1.2} radius={roomRadius + 90} plastic={plastic} soft={soft} />
      <StackingTower angle={2.2} radius={roomRadius + 60} plastic={plastic} soft={soft} />
      <RoundRug radius={roomRadius + 110} />
      <Bunting plastic={plastic} />
      <WallStars />
    </group>
  )
}

const BLOCK_SIZE = 3.2
const INSET_SIZE = 2.4
const INSET_THICKNESS = 0.2
const INSET_OFFSET = BLOCK_SIZE / 2 + INSET_THICKNESS / 2

function AlphabetBlocks({ position, soft }: { position: [number, number, number]; soft: SoftMaterials }) {
  const letters = useMemo(
    () => [
      { letter: 'D', color: PALETTE.red },
      { letter: 'O', color: PALETTE.blue },
      { letter: 'T', color: PALETTE.green },
    ],
    [],
  )

  const textures = useMemo(() => letters.map(({ letter, color }) => buildLetterTexture(letter, color, PALETTE.cream)), [letters])
  useEffect(() => () => {
    for (const texture of textures) texture.dispose()
  }, [textures])

  const insetMaterials = useMemo(
    () => letters.map(({ color }) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 })),
    [letters],
  )
  useEffect(() => () => {
    for (const material of insetMaterials) material.dispose()
  }, [insetMaterials])

  const faceMaterials = useMemo(
    () =>
      textures.map(
        (texture, i) => new THREE.MeshPhysicalMaterial({ map: texture, color: letters[i].color, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 }),
      ),
    [textures, letters],
  )
  useEffect(() => () => {
    for (const material of faceMaterials) material.dispose()
  }, [faceMaterials])

  const [x, y, z] = position
  const layout: Array<{ x: number; y: number; z: number; tiltZ: number }> = [
    { x: 0, y: BLOCK_SIZE / 2, z: 0, tiltZ: 0 },
    { x: 0, y: BLOCK_SIZE / 2 + BLOCK_SIZE, z: 0, tiltZ: 0 },
    { x: 4, y: BLOCK_SIZE / 2, z: 3, tiltZ: 0.3 },
  ]

  return (
    <group position={[x, y, z]}>
      {layout.map((block, i) => (
        <group key={i} position={[block.x, block.y, block.z]} rotation={[0, 0, block.tiltZ]}>
          <mesh castShadow receiveShadow material={soft.honey}>
            <boxGeometry args={[BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE]} />
          </mesh>
          <mesh castShadow receiveShadow position={[0, 0, INSET_OFFSET]} material={faceMaterials[i]}>
            <boxGeometry args={[INSET_SIZE, INSET_SIZE, INSET_THICKNESS]} />
          </mesh>
          <mesh castShadow receiveShadow position={[INSET_OFFSET, 0, 0]} rotation={[0, Math.PI / 2, 0]} material={insetMaterials[i]}>
            <boxGeometry args={[INSET_SIZE, INSET_SIZE, INSET_THICKNESS]} />
          </mesh>
          <mesh castShadow receiveShadow position={[0, INSET_OFFSET, 0]} rotation={[Math.PI / 2, 0, 0]} material={insetMaterials[i]}>
            <boxGeometry args={[INSET_SIZE, INSET_SIZE, INSET_THICKNESS]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function ToyCar({ position, plastic, soft }: { position: [number, number, number]; plastic: PlasticMaterials; soft: SoftMaterials }) {
  const [x, y, z] = position
  const wheelPositions: Array<[number, number]> = [
    [2, 1.5],
    [2, -1.5],
    [-2, 1.5],
    [-2, -1.5],
  ]

  return (
    <group position={[x, y, z]}>
      <mesh castShadow receiveShadow position={[0, 2, 0]} material={plastic.red}>
        <boxGeometry args={[6, 2.4, 3]} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 3.6, 0]} material={plastic.blue}>
        <boxGeometry args={[3, 1.6, 2.4]} />
      </mesh>
      {wheelPositions.map(([wx, wz], i) => (
        <group key={i}>
          <mesh castShadow receiveShadow position={[wx, 1, wz]} rotation={[Math.PI / 2, 0, 0]} material={soft.black}>
            <cylinderGeometry args={[1, 1, 0.8, 20]} />
          </mesh>
          <mesh castShadow receiveShadow position={[wx, 1, wz + Math.sign(wz) * 0.42]} rotation={[Math.PI / 2, 0, 0]} material={soft.cream}>
            <cylinderGeometry args={[0.5, 0.5, 0.08, 16]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function RubberBall({ position, plastic }: { position: [number, number, number]; plastic: PlasticMaterials }) {
  const [x, y, z] = position
  return (
    <group position={[x, y, z]}>
      <mesh castShadow receiveShadow material={plastic.yellow}>
        <sphereGeometry args={[2.4, 24, 20]} />
      </mesh>
      <mesh castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]} material={plastic.red}>
        <torusGeometry args={[2.4, 0.35, 16, 24]} />
      </mesh>
    </group>
  )
}

function CrayonBox({ position, plastic }: { position: [number, number, number]; plastic: PlasticMaterials }) {
  const [x, y, z] = position
  const colors: Array<keyof PlasticMaterials> = ['red', 'orange', 'yellow', 'green', 'blue', 'purple']
  const boxWidth = 5
  const boxDepth = 2.2
  const wallHeight = 3
  const wallThickness = 0.3

  return (
    <group position={[x, y, z]}>
      <mesh castShadow receiveShadow position={[0, wallHeight / 2, 0]} material={plastic.orange}>
        <boxGeometry args={[boxWidth, wallHeight, boxDepth]} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, wallHeight / 2 + 0.1, 0]} material={plastic.cream}>
        <boxGeometry args={[boxWidth - wallThickness * 2, wallHeight - wallThickness, boxDepth - wallThickness * 2]} />
      </mesh>
      {colors.map((key, i) => {
        const cx = -boxWidth / 2 + 0.6 + i * ((boxWidth - 1.2) / (colors.length - 1))
        return (
          <group key={key} position={[cx, wallHeight, 0]}>
            <mesh castShadow receiveShadow material={plastic[key]}>
              <cylinderGeometry args={[0.35, 0.35, 5, 16]} />
            </mesh>
            <mesh castShadow receiveShadow position={[0, 2.8, 0]} material={plastic[key]}>
              <coneGeometry args={[0.35, 0.6, 16]} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function TeddyBear({ angle, radius, soft, plastic }: { angle: number; radius: number; soft: SoftMaterials; plastic: PlasticMaterials }) {
  const [x, , z] = polarPosition(angle, radius)
  const rotationY = angle + Math.PI

  return (
    <group position={[x, FLOOR_Y, z]} rotation={[0, rotationY, 0]}>
      <mesh receiveShadow position={[0, 12, 0]} material={soft.teddy}>
        <sphereGeometry args={[12, 20, 16]} />
      </mesh>
      <mesh receiveShadow position={[0, 27, 3]} material={soft.teddy}>
        <sphereGeometry args={[9, 20, 16]} />
      </mesh>
      <mesh receiveShadow position={[-6, 34, 6]} material={soft.teddy}>
        <sphereGeometry args={[3, 16, 14]} />
      </mesh>
      <mesh receiveShadow position={[6, 34, 6]} material={soft.teddy}>
        <sphereGeometry args={[3, 16, 14]} />
      </mesh>
      <mesh receiveShadow position={[-13, 14, 2]} rotation={[0, 0, 0.5]} material={soft.teddy}>
        <sphereGeometry args={[3.5, 16, 14]} />
      </mesh>
      <mesh receiveShadow position={[13, 14, 2]} rotation={[0, 0, -0.5]} material={soft.teddy}>
        <sphereGeometry args={[3.5, 16, 14]} />
      </mesh>
      <mesh receiveShadow position={[-5, 3, 2]} material={soft.teddy}>
        <sphereGeometry args={[4.5, 16, 14]} />
      </mesh>
      <mesh receiveShadow position={[5, 3, 2]} material={soft.teddy}>
        <sphereGeometry args={[4.5, 16, 14]} />
      </mesh>
      <mesh receiveShadow position={[0, 26, 10]} material={soft.cream}>
        <sphereGeometry args={[4, 16, 14]} />
      </mesh>
      <mesh receiveShadow position={[-2, 28, 13]} material={soft.black}>
        <sphereGeometry args={[0.6, 10, 8]} />
      </mesh>
      <mesh receiveShadow position={[2, 28, 13]} material={soft.black}>
        <sphereGeometry args={[0.6, 10, 8]} />
      </mesh>
      <mesh receiveShadow position={[-1.2, 24, 11]} rotation={[Math.PI / 2, 0, 0.4]} material={plastic.red}>
        <coneGeometry args={[1.5, 2, 12]} />
      </mesh>
      <mesh receiveShadow position={[1.2, 24, 11]} rotation={[Math.PI / 2, 0, -0.4]} material={plastic.red}>
        <coneGeometry args={[1.5, 2, 12]} />
      </mesh>
    </group>
  )
}

function TrainWheels({ length, soft }: { length: number; soft: SoftMaterials }) {
  const xs = [-length / 2 + 3, length / 2 - 3]
  const zs = [-7, 7]
  return (
    <>
      {xs.map((wx) =>
        zs.map((wz) => (
          <mesh key={`${wx}-${wz}`} receiveShadow position={[wx, 1.5, wz]} rotation={[Math.PI / 2, 0, 0]} material={soft.black}>
            <cylinderGeometry args={[1.5, 1.5, 0.6, 16]} />
          </mesh>
        )),
      )}
    </>
  )
}

function ToyTrain({ angle, radius, plastic, soft }: { angle: number; radius: number; plastic: PlasticMaterials; soft: SoftMaterials }) {
  const [x, , z] = polarPosition(angle, radius)
  const rotationY = angle + Math.PI / 2

  return (
    <group position={[x, FLOOR_Y, z]} rotation={[0, rotationY, 0]}>
      <mesh receiveShadow position={[-4, 0.3, 7]} material={soft.honey}>
        <boxGeometry args={[80, 0.6, 1]} />
      </mesh>
      <mesh receiveShadow position={[-4, 0.3, -7]} material={soft.honey}>
        <boxGeometry args={[80, 0.6, 1]} />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} receiveShadow position={[-36 + i * 15, 0.15, 0]} material={soft.honey}>
          <boxGeometry args={[2, 0.3, 16]} />
        </mesh>
      ))}

      <group position={[22, 0, 0]}>
        <mesh receiveShadow position={[0, 8.5, 0]} material={plastic.blue}>
          <boxGeometry args={[24, 14, 14]} />
        </mesh>
        <mesh receiveShadow position={[-4, 17, 0]} rotation={[Math.PI / 2, 0, 0]} material={plastic.green}>
          <cylinderGeometry args={[5, 5, 10, 16]} />
        </mesh>
        <mesh receiveShadow position={[-4, 23, 0]} material={plastic.red}>
          <cylinderGeometry args={[2, 3, 6, 16]} />
        </mesh>
        <mesh receiveShadow position={[7, 17, 0]} material={soft.cream}>
          <boxGeometry args={[8, 10, 12]} />
        </mesh>
        <TrainWheels length={20} soft={soft} />
      </group>

      {[
        { color: plastic.yellow, x: -6 },
        { color: plastic.purple, x: -30 },
      ].map((carriage, i) => (
        <group key={i} position={[carriage.x, 0, 0]}>
          <mesh receiveShadow position={[0, 7, 0]} material={carriage.color}>
            <boxGeometry args={[18, 10, 12]} />
          </mesh>
          <mesh receiveShadow position={[10, 3.5, 0]} material={soft.honey}>
            <boxGeometry args={[2, 1, 2]} />
          </mesh>
          <TrainWheels length={14} soft={soft} />
        </group>
      ))}
    </group>
  )
}

function StackingTower({ angle, radius, plastic, soft }: { angle: number; radius: number; plastic: PlasticMaterials; soft: SoftMaterials }) {
  const [x, , z] = polarPosition(angle, radius)
  const rings: Array<{ material: THREE.MeshPhysicalMaterial; outerRadius: number; y: number }> = [
    { material: plastic.red, outerRadius: 12, y: 3 },
    { material: plastic.orange, outerRadius: 10, y: 7 },
    { material: plastic.yellow, outerRadius: 8.5, y: 11 },
    { material: plastic.green, outerRadius: 7, y: 15 },
    { material: plastic.blue, outerRadius: 5, y: 19 },
  ]

  return (
    <group position={[x, FLOOR_Y, z]}>
      <mesh receiveShadow position={[0, 1, 0]} material={soft.honey}>
        <cylinderGeometry args={[14, 14, 2, 24]} />
      </mesh>
      <mesh receiveShadow position={[0, 12, 0]} material={soft.honey}>
        <cylinderGeometry args={[1.2, 1.2, 22, 16]} />
      </mesh>
      {rings.map((ring, i) => (
        <mesh key={i} receiveShadow position={[0, ring.y, 0]} rotation={[Math.PI / 2, 0, 0]} material={ring.material}>
          <torusGeometry args={[ring.outerRadius, 3, 16, 24]} />
        </mesh>
      ))}
    </group>
  )
}

function RoundRug({ radius }: { radius: number }) {
  // Alternating coloured and cream discs, each above the last, so the rug reads as thin bands.
  const rings: Array<{ color: string; scale: number }> = [
    { color: PALETTE.pink, scale: 0.94 },
    { color: PALETTE.cream, scale: 0.86 },
    { color: '#ffe9a3', scale: 0.72 },
    { color: PALETTE.cream, scale: 0.64 },
    { color: '#a9d8f5', scale: 0.5 },
    { color: PALETTE.cream, scale: 0.42 },
  ]

  return (
    <group>
      <mesh receiveShadow position={[0, FLOOR_Y + 0.3, 0]}>
        <cylinderGeometry args={[radius, radius, 0.6, 48]} />
        <meshStandardMaterial color={PALETTE.cream} roughness={0.9} />
      </mesh>
      {rings.map((ring, i) => (
        <mesh key={i} receiveShadow position={[0, FLOOR_Y + 0.6 + 0.1 * (i + 1), 0]}>
          <cylinderGeometry args={[radius * ring.scale, radius * ring.scale, 0.2, 48]} />
          <meshStandardMaterial color={ring.color} roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

function Bunting({ plastic }: { plastic: PlasticMaterials }) {
  const stringSegments = useMemo(() => {
    const segments = 40
    const result: Array<{ position: THREE.Vector3; quaternion: THREE.Quaternion; length: number }> = []
    let prev = new THREE.Vector3(...buntingCurve(0))
    for (let i = 1; i <= segments; i++) {
      const t = i / segments
      const curr = new THREE.Vector3(...buntingCurve(t))
      const mid = prev.clone().add(curr).multiplyScalar(0.5)
      const dir = curr.clone().sub(prev)
      const length = dir.length()
      const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
      result.push({ position: mid, quaternion, length })
      prev = curr
    }
    return result
  }, [])

  const flagColors: Array<keyof PlasticMaterials> = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink']
  const flagCount = 11

  return (
    <group>
      {stringSegments.map((segment, i) => (
        <mesh key={i} receiveShadow position={segment.position} quaternion={segment.quaternion}>
          <cylinderGeometry args={[0.3, 0.3, segment.length, 6]} />
          <meshStandardMaterial color={PALETTE.cream} roughness={0.9} />
        </mesh>
      ))}
      {Array.from({ length: flagCount }, (_, i) => {
        const t = (i + 0.5) / flagCount
        const [fx, fy, fz] = buntingCurve(t)
        const colorKey = flagColors[i % flagColors.length]
        return (
          <mesh key={i} receiveShadow position={[fx, fy - 6, fz]} rotation={[Math.PI, 0, 0]} scale={[1, 1, 0.15]} material={plastic[colorKey]}>
            <coneGeometry args={[7, 12, 3]} />
          </mesh>
        )
      })}
    </group>
  )
}

function WallStars() {
  const geometry = useMemo(() => new THREE.ShapeGeometry(buildStarShape(), 12), [])
  useEffect(() => () => geometry.dispose(), [geometry])

  const stars = useMemo(() => {
    const colors = [PALETTE.yellow, PALETTE.cream, PALETTE.pink]
    const count = 8
    const list: Array<{ angle: number; height: number; color: string }> = []
    for (let i = 0; i < count; i++) {
      const angle = THREE.MathUtils.lerp(-1.4, 1.4, i / (count - 1))
      const height = THREE.MathUtils.lerp(20, 110, (i * 2.618) % 1)
      list.push({ angle, height, color: colors[i % colors.length] })
    }
    return list
  }, [])

  return (
    <group>
      {stars.map((star, i) => {
        // On the back wall (-z), facing into the room.
        const x = WALL_RADIUS * Math.sin(star.angle)
        const z = -WALL_RADIUS * Math.cos(star.angle)
        const rotationY = -star.angle
        return (
          <mesh key={i} receiveShadow geometry={geometry} position={[x, star.height, z]} rotation={[0, rotationY, 0]}>
            <meshStandardMaterial color={star.color} roughness={0.6} side={THREE.DoubleSide} />
          </mesh>
        )
      })}
    </group>
  )
}
