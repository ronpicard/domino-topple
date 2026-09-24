/*
 * A cosy study around the walnut desk: a working desk lamp, a stack of books, a pencil cup,
 * a coffee mug, an optional potted plant, a leaning framed photo, and wall décor (bookshelf,
 * window, rug). Everything is built from three.js primitives — no models, no textures.
 */

import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { ROOM_FLOOR_Y, ROOM_RADIUS } from './Room.tsx'

const FLOOR_Y = ROOM_FLOOR_Y

interface DeskPropsArgs {
  width: number
  depth: number
}

interface SharedMaterials {
  walnut: THREE.MeshStandardMaterial
  brass: THREE.MeshStandardMaterial
  ivory: THREE.MeshStandardMaterial
  clothRed: THREE.MeshStandardMaterial
  clothBlue: THREE.MeshStandardMaterial
  clothGold: THREE.MeshStandardMaterial
  pencilYellow: THREE.MeshStandardMaterial
  eraserPink: THREE.MeshStandardMaterial
  leafGreen: THREE.MeshStandardMaterial
  terracotta: THREE.MeshStandardMaterial
  frameDark: THREE.MeshStandardMaterial
}

export function DeskProps({ width, depth }: DeskPropsArgs) {
  const edgeX = width / 2 + 4
  const edgeZ = depth / 2 + 4

  const materials = useMemo<SharedMaterials>(
    () => ({
      walnut: new THREE.MeshStandardMaterial({ color: '#4b2c1a', roughness: 0.55 }),
      brass: new THREE.MeshStandardMaterial({ color: '#c9a24a', metalness: 0.85, roughness: 0.35 }),
      ivory: new THREE.MeshStandardMaterial({ color: '#f4ecd8', roughness: 0.5 }),
      clothRed: new THREE.MeshStandardMaterial({ color: '#8b3a3a', roughness: 0.7 }),
      clothBlue: new THREE.MeshStandardMaterial({ color: '#2f4f6f', roughness: 0.7 }),
      clothGold: new THREE.MeshStandardMaterial({ color: '#c8a951', roughness: 0.6 }),
      pencilYellow: new THREE.MeshStandardMaterial({ color: '#e8b23a', roughness: 0.6 }),
      eraserPink: new THREE.MeshStandardMaterial({ color: '#e8a0a0', roughness: 0.7 }),
      leafGreen: new THREE.MeshStandardMaterial({ color: '#3f8f4f', roughness: 0.6 }),
      terracotta: new THREE.MeshStandardMaterial({ color: '#b5643c', roughness: 0.8 }),
      frameDark: new THREE.MeshStandardMaterial({ color: '#2a2018', roughness: 0.6 }),
    }),
    [],
  )

  useEffect(
    () => () => {
      Object.values(materials).forEach((material) => material.dispose())
    },
    [materials],
  )

  const lampPos: [number, number, number] = [-edgeX + 3, 0, -edgeZ + 3]
  const bookPos: [number, number, number] = [edgeX - 6, 0, -edgeZ + 4]
  const cupPos: [number, number, number] = [edgeX - 4, 0, edgeZ - 5]
  const mugPos: [number, number, number] = [-edgeX + 5, 0, edgeZ - 6]
  const plantPos: [number, number, number] = [-edgeX + 4, 0, 0]
  const chairPos: [number, number, number] = [width / 4, FLOOR_Y, -(depth / 2 + 8) - 95]
  const basketPos: [number, number, number] = [-(width / 2 + 8) - 34, FLOOR_Y, -depth / 2 - 20]

  return (
    <group>
      <DeskLamp position={lampPos} materials={materials} />
      <BookStack position={bookPos} materials={materials} />
      <PencilCup position={cupPos} materials={materials} />
      <CoffeeMug position={mugPos} materials={materials} />
      {depth > 60 && <PottedPlant position={plantPos} materials={materials} />}
      <FramedPhoto lampPosition={lampPos} materials={materials} />
      <DeskChair position={chairPos} />
      <WasteBasket position={basketPos} materials={materials} />

      <Bookshelf angle={0.35} materials={materials} />
      <Window angle={-0.5} materials={materials} />
      <Rug width={width} depth={depth} />
    </group>
  )
}

function wallTransform(angle: number, radius: number, y: number): { position: [number, number, number]; rotationY: number } {
  return {
    position: [radius * Math.sin(angle), y, -radius * Math.cos(angle)],
    rotationY: -angle,
  }
}

function DeskLamp({
  position,
  materials,
}: {
  position: [number, number, number]
  materials: SharedMaterials
}) {
  // Direction (in this lamp group's local frame) from the lamp toward the table centre.
  const localYaw = Math.atan2(-position[0], -position[2])

  const ELBOW_Y = 14
  const TILT = 1.1
  const ARM_UPPER_LEN = 9
  const upperMidY = ELBOW_Y + (ARM_UPPER_LEN / 2) * Math.cos(TILT)
  const upperMidZ = (ARM_UPPER_LEN / 2) * Math.sin(TILT)
  const tipY = ELBOW_Y + ARM_UPPER_LEN * Math.cos(TILT)
  const tipZ = ARM_UPPER_LEN * Math.sin(TILT)
  const shadeY = tipY + 2 * Math.cos(TILT)
  const shadeZ = tipZ + 2 * Math.sin(TILT)

  const target = useMemo(() => new THREE.Object3D(), [])
  const targetLocal: [number, number, number] = [-position[0], 1, -position[2]]

  const toOuter = (y: number, z: number): [number, number, number] => [z * Math.sin(localYaw), y, z * Math.cos(localYaw)]
  const spotPos = toOuter(shadeY, shadeZ)

  return (
    <group position={position}>
      <mesh castShadow receiveShadow material={materials.brass} position={[0, 0.5, 0]}>
        <cylinderGeometry args={[3.5, 3.5, 1, 20]} />
      </mesh>

      <group rotation={[0, localYaw, 0]}>
        <mesh castShadow material={materials.brass} position={[0, 1 + ELBOW_Y / 2 - 0.5, 0]}>
          <cylinderGeometry args={[0.4, 0.4, ELBOW_Y - 1, 12]} />
        </mesh>
        <mesh castShadow material={materials.brass} position={[0, ELBOW_Y, 0]}>
          <sphereGeometry args={[0.6, 12, 10]} />
        </mesh>
        <mesh castShadow material={materials.brass} position={[0, upperMidY, upperMidZ]} rotation={[TILT, 0, 0]}>
          <cylinderGeometry args={[0.4, 0.4, ARM_UPPER_LEN, 12]} />
        </mesh>
        <mesh castShadow material={materials.brass} position={[0, shadeY, shadeZ]} rotation={[TILT, 0, 0]}>
          <coneGeometry args={[5, 6, 20]} />
        </mesh>
        <mesh position={[0, shadeY - 0.6 * Math.cos(TILT), shadeZ - 0.6 * Math.sin(TILT)]}>
          <sphereGeometry args={[0.9, 12, 10]} />
          <meshStandardMaterial color="#ffd9a0" emissive="#ffd9a0" emissiveIntensity={2} toneMapped={false} />
        </mesh>
      </group>

      <primitive object={target} position={targetLocal} />
      <spotLight
        color="#ffd9a0"
        intensity={1200}
        angle={0.55}
        penumbra={0.6}
        distance={200}
        decay={2}
        castShadow={false}
        position={spotPos}
        target={target}
      />
    </group>
  )
}

function BookStack({ position, materials }: { position: [number, number, number]; materials: SharedMaterials }) {
  const books = [
    { y: 1, dx: 0, dz: 0, ry: 0, material: materials.clothRed },
    { y: 3, dx: 0.3, dz: -0.2, ry: 0.05, material: materials.clothBlue },
    { y: 5, dx: -0.2, dz: 0.3, ry: 0.2, material: materials.clothGold },
  ]

  return (
    <group position={position}>
      {books.map((book, i) => (
        <group key={i} position={[book.dx, book.y, book.dz]} rotation={[0, book.ry, 0]}>
          <mesh castShadow receiveShadow material={book.material}>
            <boxGeometry args={[12, 2, 8]} />
          </mesh>
          <mesh castShadow receiveShadow material={materials.ivory} position={[-0.5, 0, 0]}>
            <boxGeometry args={[11, 1.6, 7.2]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function PencilCup({ position, materials }: { position: [number, number, number]; materials: SharedMaterials }) {
  const pencils = [
    { dx: 0.3, dz: 0.5, rx: 0.15, rz: 0.1 },
    { dx: -0.4, dz: 0.3, rx: -0.1, rz: 0.2 },
    { dx: 0.2, dz: -0.5, rx: 0.2, rz: -0.15 },
    { dx: -0.3, dz: -0.2, rx: -0.15, rz: -0.2 },
  ]

  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, 3, 0]}>
        <cylinderGeometry args={[2.4, 2.4, 6, 20]} />
        <meshStandardMaterial color="#1f4d3a" roughness={0.6} />
      </mesh>
      {pencils.map((p, i) => (
        <group key={i} position={[p.dx, 6, p.dz]} rotation={[p.rx, 0, p.rz]}>
          <mesh castShadow material={materials.pencilYellow}>
            <cylinderGeometry args={[0.35, 0.35, 12, 10]} />
          </mesh>
          <mesh castShadow material={materials.eraserPink} position={[0, 6.4, 0]}>
            <cylinderGeometry args={[0.4, 0.4, 0.8, 10]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function CoffeeMug({ position, materials }: { position: [number, number, number]; materials: SharedMaterials }) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow material={materials.ivory} position={[0, 2.2, 0]}>
        <cylinderGeometry args={[2.4, 2.4, 4.4, 20]} />
      </mesh>
      <mesh castShadow material={materials.ivory} position={[2.6, 2.2, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[1.1, 0.3, 12, 20]} />
      </mesh>
      <mesh position={[0, 4, 0]}>
        <cylinderGeometry args={[2.1, 2.1, 0.15, 20]} />
        <meshStandardMaterial color="#3a2313" roughness={0.2} />
      </mesh>
    </group>
  )
}

function PottedPlant({ position, materials }: { position: [number, number, number]; materials: SharedMaterials }) {
  const leaves = [0, 1, 2, 3, 4, 5].map((i) => {
    const angle = (i / 6) * Math.PI * 2
    return { angle, tilt: 0.4 + (i % 2) * 0.2, h: 4.5 + (i % 3) * 0.6 }
  })

  return (
    <group position={position}>
      <mesh castShadow receiveShadow material={materials.terracotta} position={[0, 1.7, 0]}>
        <cylinderGeometry args={[2.6, 1.8, 3.4, 16]} />
      </mesh>
      <mesh position={[0, 3.5, 0]}>
        <cylinderGeometry args={[2.3, 2.3, 0.2, 16]} />
        <meshStandardMaterial color="#2a1c12" roughness={1} />
      </mesh>
      {leaves.map((leaf, i) => (
        <group key={i} position={[0, 3.6, 0]} rotation={[0, leaf.angle, 0]}>
          <mesh castShadow position={[0, (leaf.h - 1) / 2, 1.3]}>
            <cylinderGeometry args={[0.12, 0.12, leaf.h - 1, 6]} />
            <meshStandardMaterial color="#3a5f2a" roughness={0.7} />
          </mesh>
          <mesh
            castShadow
            material={materials.leafGreen}
            position={[0, leaf.h, 2.4]}
            rotation={[leaf.tilt, 0, 0]}
            scale={[0.9, 0.3, 1.8]}
          >
            <sphereGeometry args={[1.4, 12, 10]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function FramedPhoto({ lampPosition, materials }: { lampPosition: [number, number, number]; materials: SharedMaterials }) {
  const position: [number, number, number] = [lampPosition[0] + 3.2, 2.5, lampPosition[2] + 1.5]

  return (
    <group position={position} rotation={[-0.35, 0.3, 0]}>
      <mesh castShadow receiveShadow material={materials.frameDark}>
        <boxGeometry args={[6, 5, 0.5]} />
      </mesh>
      <mesh castShadow material={materials.ivory} position={[0, 0, 0.3]}>
        <boxGeometry args={[5.2, 4.2, 0.15]} />
      </mesh>
    </group>
  )
}

function DeskChair({ position }: { position: [number, number, number] }) {
  const legAngles = [0, 1, 2, 3, 4].map((i) => (i / 5) * Math.PI * 2)
  const armX = [-19, 19]

  return (
    <group position={position}>
      <mesh receiveShadow castShadow={false} position={[0, 1, 0]}>
        <cylinderGeometry args={[3, 3, 2, 16]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.5} metalness={0.3} />
      </mesh>
      {legAngles.map((angle, i) => (
        <group key={i} rotation={[0, angle, 0]}>
          <mesh receiveShadow castShadow={false} position={[9, 1, 0]}>
            <boxGeometry args={[18, 2, 3]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.5} metalness={0.3} />
          </mesh>
        </group>
      ))}
      <mesh receiveShadow castShadow={false} position={[0, 20, 0]}>
        <cylinderGeometry args={[2, 2, 40, 12]} />
        <meshStandardMaterial color="#8a8f94" roughness={0.3} metalness={0.7} />
      </mesh>
      <mesh receiveShadow castShadow={false} position={[0, 45, 0]}>
        <boxGeometry args={[42, 6, 40]} />
        <meshStandardMaterial color="#2f4a3c" roughness={0.5} />
      </mesh>
      {armX.map((x, i) => (
        <group key={i}>
          <mesh receiveShadow castShadow={false} position={[x, 54, 4]}>
            <boxGeometry args={[2, 18, 2]} />
            <meshStandardMaterial color="#c9ccce" roughness={0.3} metalness={0.6} />
          </mesh>
          <mesh receiveShadow castShadow={false} position={[x, 62, -6]}>
            <boxGeometry args={[2, 2, 22]} />
            <meshStandardMaterial color="#c9ccce" roughness={0.3} metalness={0.6} />
          </mesh>
        </group>
      ))}
      <mesh receiveShadow castShadow={false} position={[0, 75, -17]} rotation={[-0.12, 0, 0]}>
        <boxGeometry args={[40, 46, 5]} />
        <meshStandardMaterial color="#2f4a3c" roughness={0.5} />
      </mesh>
    </group>
  )
}

function WasteBasket({ position, materials }: { position: [number, number, number]; materials: SharedMaterials }) {
  return (
    <group position={position}>
      <mesh receiveShadow position={[0, 14, 0]}>
        <cylinderGeometry args={[11, 9, 28, 16, 1, true]} />
        <meshStandardMaterial color="#26332c" roughness={0.7} metalness={0.4} side={THREE.DoubleSide} />
      </mesh>
      <mesh receiveShadow material={materials.ivory} position={[2, 25, 1]}>
        <sphereGeometry args={[3.5, 8, 6]} />
      </mesh>
      <mesh receiveShadow material={materials.ivory} position={[-2.5, 24, -2]}>
        <sphereGeometry args={[3.5, 8, 6]} />
      </mesh>
    </group>
  )
}

function Bookshelf({ angle, materials }: { angle: number; materials: SharedMaterials }) {
  const { position, rotationY } = wallTransform(angle, ROOM_RADIUS - 15, FLOOR_Y + 90)

  const shelfYs = [-55, 0, 55]
  const bookColors = [materials.clothRed, materials.clothBlue, materials.clothGold, materials.ivory, materials.walnut]

  const books = useMemo(() => {
    const list: { shelfY: number; x: number; h: number; w: number; d: number; colorIndex: number; tilt: number }[] = []
    let seed = 0
    for (const shelfY of shelfYs) {
      const count = shelfY === 0 ? 4 : 5
      let x = -48
      for (let i = 0; i < count; i++) {
        const h = 16 + ((seed * 7) % 12)
        const w = 1.8 + ((seed * 3) % 10) / 10
        const d = 18 + ((seed * 5) % 6)
        const tilt = seed % 4 === 0 ? 0.08 : 0
        list.push({ shelfY, x, h, w, d, colorIndex: seed % bookColors.length, tilt })
        x += w + 1.4
        seed++
      }
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh receiveShadow material={materials.walnut}>
        <boxGeometry args={[120, 180, 30]} />
      </mesh>
      {shelfYs.map((y, i) => (
        <mesh key={i} receiveShadow material={materials.walnut} position={[0, y, 1]}>
          <boxGeometry args={[112, 2, 26]} />
        </mesh>
      ))}
      {books.map((book, i) => (
        <mesh
          key={i}
          receiveShadow
          material={bookColors[book.colorIndex]}
          position={[book.x, book.shelfY + 1 + book.h / 2, 2]}
          rotation={[0, 0, book.tilt]}
        >
          <boxGeometry args={[book.w, book.h, book.d]} />
        </mesh>
      ))}
    </group>
  )
}

function Window({ angle, materials }: { angle: number; materials: SharedMaterials }) {
  const { position, rotationY } = wallTransform(angle, ROOM_RADIUS - 2, FLOOR_Y + 120)
  const dirVec: [number, number, number] = [Math.sin(-angle), 0, Math.cos(-angle)]
  const lightPos: [number, number, number] = [
    position[0] + dirVec[0] * 40,
    position[1],
    position[2] + dirVec[2] * 40,
  ]

  return (
    <group>
      <group position={position} rotation={[0, rotationY, 0]}>
        <mesh receiveShadow material={materials.frameDark}>
          <boxGeometry args={[110, 130, 6]} />
        </mesh>
        <mesh position={[0, 0, 3.2]}>
          <planeGeometry args={[100, 120]} />
          <meshBasicMaterial color="#bfd4e6" toneMapped={false} />
        </mesh>
        <mesh material={materials.frameDark} position={[0, 0, 3.6]}>
          <boxGeometry args={[4, 122, 1]} />
        </mesh>
        <mesh material={materials.frameDark} position={[0, 0, 3.6]}>
          <boxGeometry args={[102, 4, 1]} />
        </mesh>
      </group>
      <pointLight color="#bfd4e6" intensity={400} distance={500} decay={2} castShadow={false} position={lightPos} />
    </group>
  )
}

function Rug({ width, depth }: { width: number; depth: number }) {
  const radius = Math.max(width, depth) / 2 + 70
  const innerRadius = Math.max(width, depth) / 2 + 40

  return (
    <group>
      <mesh receiveShadow position={[0, FLOOR_Y + 0.31, 0]}>
        <cylinderGeometry args={[radius, radius, 0.6, 48]} />
        <meshStandardMaterial color="#3a2220" roughness={0.95} />
      </mesh>
      <mesh receiveShadow position={[0, FLOOR_Y + 0.32, 0]}>
        <cylinderGeometry args={[innerRadius, innerRadius, 0.62, 48]} />
        <meshStandardMaterial color="#4a2c26" roughness={0.95} />
      </mesh>
    </group>
  )
}
