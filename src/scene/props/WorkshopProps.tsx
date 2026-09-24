/*
 * Workshop chapter dressing: a garage steel workbench surrounded by pegboard tools, a hanging
 * work lamp, a bench vice, jars of hardware, an oil can, a tape measure, a floor toolbox, a
 * rolling tool cabinet, a sawhorse pair and a rubber floor mat. Built entirely from three.js
 * primitives, themed by the shared workshop palette.
 */

import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { ROOM_RADIUS } from './Room.tsx'

const PEGBOARD_Z = -(ROOM_RADIUS - 14)
const LAMP_CEILING_Y = 240

const PALETTE = {
  steel: '#9aa2a8',
  iron: '#3a3d42',
  tan: '#b58e5f',
  red: '#c0392b',
  yellow: '#f2b134',
  oak: '#a3743f',
  rubber: '#2b2b2b',
  glass: '#cfe3ee',
}

interface WorkshopMaterials {
  steel: THREE.MeshStandardMaterial
  iron: THREE.MeshStandardMaterial
  tan: THREE.MeshStandardMaterial
  red: THREE.MeshStandardMaterial
  yellow: THREE.MeshStandardMaterial
  oak: THREE.MeshStandardMaterial
  rubber: THREE.MeshStandardMaterial
  glass: THREE.MeshPhysicalMaterial
}

export function WorkshopProps({ width, depth }: { width: number; depth: number }) {
  const edgeX = width / 2 + 4
  const edgeZ = depth / 2 + 4

  const materials = useMemo<WorkshopMaterials>(
    () => ({
      steel: new THREE.MeshStandardMaterial({ color: PALETTE.steel, metalness: 0.85, roughness: 0.3 }),
      iron: new THREE.MeshStandardMaterial({ color: PALETTE.iron, metalness: 0.6, roughness: 0.5 }),
      tan: new THREE.MeshStandardMaterial({ color: PALETTE.tan, roughness: 0.8 }),
      red: new THREE.MeshStandardMaterial({ color: PALETTE.red, roughness: 0.4 }),
      yellow: new THREE.MeshStandardMaterial({ color: PALETTE.yellow, roughness: 0.5 }),
      oak: new THREE.MeshStandardMaterial({ color: PALETTE.oak, roughness: 0.7 }),
      rubber: new THREE.MeshStandardMaterial({ color: PALETTE.rubber, roughness: 1 }),
      glass: new THREE.MeshPhysicalMaterial({ color: PALETTE.glass, transparent: true, opacity: 0.35, roughness: 0.1 }),
    }),
    [],
  )

  useEffect(
    () => () => {
      materials.steel.dispose()
      materials.iron.dispose()
      materials.tan.dispose()
      materials.red.dispose()
      materials.yellow.dispose()
      materials.oak.dispose()
      materials.rubber.dispose()
      materials.glass.dispose()
    },
    [materials],
  )

  const cabinetAngle = 0.9
  const cabinetRadius = 300
  const cabinetX = cabinetRadius * Math.cos(cabinetAngle)
  const cabinetZ = cabinetRadius * Math.sin(cabinetAngle)
  const cabinetFacing = Math.atan2(-cabinetX, -cabinetZ)

  const sawhorseAngle = -0.9
  const sawhorseRadius = 340
  const sawhorseX = sawhorseRadius * Math.cos(sawhorseAngle)
  const sawhorseZ = sawhorseRadius * Math.sin(sawhorseAngle)
  const sawhorseFacing = Math.atan2(-sawhorseX, -sawhorseZ)

  const floorRadius = Math.max(width, depth) / 2 + 60

  return (
    <group>
      <Pegboard materials={materials} />
      <WorkLamp />

      <group position={[edgeX + 2, 0, edgeZ * 0.4]}>
        <BenchVice materials={materials} />
      </group>

      <group position={[-edgeX + 4, 0, -edgeZ + 4]}>
        <ScrewJar materials={materials} />
      </group>
      <group position={[-edgeX + 9, 0, -edgeZ + 3]}>
        <ScrewJar materials={materials} />
      </group>

      <group position={[edgeX - 5, 0, -edgeZ + 4]}>
        <OilCan materials={materials} />
      </group>

      <group position={[edgeX - 6, 0, edgeZ - 5]}>
        <TapeMeasure materials={materials} />
      </group>

      <group position={[floorRadius, 0, 30]}>
        <Toolbox materials={materials} />
      </group>

      <group position={[cabinetX, 0, cabinetZ]} rotation={[0, cabinetFacing, 0]}>
        <ToolCabinet materials={materials} />
      </group>

      <group position={[sawhorseX, 0, sawhorseZ]} rotation={[0, sawhorseFacing, 0]}>
        <Sawhorses materials={materials} />
      </group>

      <mesh position={[0, -74.5, 0]} material={materials.rubber} receiveShadow>
        <boxGeometry args={[width + 140, 1, depth + 140]} />
      </mesh>
    </group>
  )
}

function Pegboard({ materials }: { materials: WorkshopMaterials }) {
  return (
    <group>
      <mesh position={[0, -75 + 120, PEGBOARD_Z]} material={materials.tan} castShadow receiveShadow>
        <boxGeometry args={[200, 120, 2]} />
      </mesh>

      <PegTool x={-70} y={80}>
        <Hammer materials={materials} />
      </PegTool>
      <PegTool x={-35} y={72}>
        <Wrench materials={materials} />
      </PegTool>
      <PegTool x={0} y={80}>
        <Screwdriver materials={materials} />
      </PegTool>
      <PegTool x={35} y={72}>
        <HandSaw materials={materials} />
      </PegTool>
      <PegTool x={70} y={72}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={materials.yellow} castShadow>
          <torusGeometry args={[4, 0.6, 12, 20]} />
        </mesh>
      </PegTool>
    </group>
  )
}

function PegTool({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <group position={[x, y, PEGBOARD_Z + 1]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 1.5]} castShadow>
        <cylinderGeometry args={[0.4, 0.4, 3, 12]} />
        <meshStandardMaterial color={PALETTE.steel} metalness={0.85} roughness={0.3} />
      </mesh>
      <group position={[0, 0, 3]}>{children}</group>
    </group>
  )
}

function Hammer({ materials }: { materials: WorkshopMaterials }) {
  return (
    <group position={[0, -6, 0]}>
      <mesh material={materials.oak} castShadow>
        <cylinderGeometry args={[0.5, 0.5, 12, 12]} />
      </mesh>
      <mesh position={[0, 6.5, 0]} material={materials.iron} castShadow>
        <boxGeometry args={[3, 1.5, 1.5]} />
      </mesh>
    </group>
  )
}

function Wrench({ materials }: { materials: WorkshopMaterials }) {
  return (
    <group>
      <mesh material={materials.steel} castShadow>
        <boxGeometry args={[8, 1.2, 0.3]} />
      </mesh>
      <mesh position={[-4, 0, 0]} rotation={[Math.PI / 2, 0, 0]} material={materials.steel} castShadow>
        <cylinderGeometry args={[0.9, 0.9, 0.3, 12]} />
      </mesh>
      <mesh position={[4, 0, 0]} rotation={[Math.PI / 2, 0, 0]} material={materials.steel} castShadow>
        <cylinderGeometry args={[0.9, 0.9, 0.3, 12]} />
      </mesh>
    </group>
  )
}

function Screwdriver({ materials }: { materials: WorkshopMaterials }) {
  return (
    <group position={[0, -5, 0]}>
      <mesh material={materials.red} castShadow>
        <cylinderGeometry args={[0.6, 0.6, 3, 12]} />
      </mesh>
      <mesh position={[0, 4.5, 0]} material={materials.steel} castShadow>
        <cylinderGeometry args={[0.25, 0.25, 6, 12]} />
      </mesh>
    </group>
  )
}

function HandSaw({ materials }: { materials: WorkshopMaterials }) {
  return (
    <group rotation={[0, 0, -0.15]}>
      <mesh material={materials.steel} castShadow>
        <boxGeometry args={[10, 2, 0.15]} />
      </mesh>
      <mesh position={[-6, -1, 0]} material={materials.oak} castShadow>
        <boxGeometry args={[3, 2, 1]} />
      </mesh>
    </group>
  )
}

function WorkLamp() {
  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, (LAMP_CEILING_Y + 125) / 2, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.3, LAMP_CEILING_Y - 125, 12]} />
        <meshStandardMaterial color={PALETTE.iron} roughness={0.6} />
      </mesh>
      <mesh position={[0, 125, 0]} castShadow>
        <sphereGeometry args={[12, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={PALETTE.iron} metalness={0.5} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 120, 0]}>
        <sphereGeometry args={[3, 16, 12]} />
        <meshStandardMaterial color="#fff1d0" emissive="#fff1d0" emissiveIntensity={3} toneMapped={false} />
      </mesh>
      <pointLight color="#fff1d0" intensity={900} distance={400} decay={2} position={[0, 115, 0]} castShadow={false} />
    </group>
  )
}

function BenchVice({ materials }: { materials: WorkshopMaterials }) {
  return (
    <group>
      <mesh position={[0, 2, 0]} material={materials.iron} castShadow receiveShadow>
        <boxGeometry args={[6, 4, 4]} />
      </mesh>
      <mesh position={[2, 3, 0]} material={materials.steel} castShadow>
        <boxGeometry args={[1.5, 2.5, 4.4]} />
      </mesh>
      <mesh position={[4.5, 3, 0]} material={materials.steel} castShadow>
        <boxGeometry args={[1.5, 2.5, 4.4]} />
      </mesh>
      <mesh position={[3.2, 3, 0]} rotation={[0, 0, Math.PI / 2]} material={materials.steel} castShadow>
        <cylinderGeometry args={[0.5, 0.5, 3.5, 12]} />
      </mesh>
      <mesh position={[3.2, 3, 0]} material={materials.steel} castShadow>
        <cylinderGeometry args={[0.3, 0.3, 8, 12]} />
      </mesh>
    </group>
  )
}

function ScrewJar({ materials }: { materials: WorkshopMaterials }) {
  return (
    <group>
      <mesh position={[0, 3, 0]} material={materials.glass} castShadow receiveShadow>
        <cylinderGeometry args={[2.2, 2.2, 6, 20]} />
      </mesh>
      <mesh position={[0, 2, 0]} material={materials.steel} castShadow>
        <cylinderGeometry args={[1.8, 1.8, 3.5, 16]} />
      </mesh>
      <mesh position={[0, 6.3, 0]} material={materials.iron} castShadow>
        <cylinderGeometry args={[2.3, 2.3, 0.6, 20]} />
      </mesh>
    </group>
  )
}

function OilCan({ materials }: { materials: WorkshopMaterials }) {
  return (
    <group>
      <mesh position={[0, 2.5, 0]} material={materials.red} castShadow receiveShadow>
        <cylinderGeometry args={[2.2, 2.2, 5, 16]} />
      </mesh>
      <mesh position={[0, 5.75, 0]} material={materials.red} castShadow>
        <coneGeometry args={[2.2, 1.5, 16]} />
      </mesh>
      <mesh position={[2, 6, 0]} rotation={[0, 0, 0.9]} material={materials.steel} castShadow>
        <cylinderGeometry args={[0.25, 0.25, 3, 12]} />
      </mesh>
      <mesh position={[3.4, 7.3, 0]} rotation={[0, 0, 1.6]} material={materials.steel} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 2, 12]} />
      </mesh>
    </group>
  )
}

function TapeMeasure({ materials }: { materials: WorkshopMaterials }) {
  return (
    <group position={[0, 1.5, 0]}>
      <mesh material={materials.yellow} castShadow receiveShadow>
        <boxGeometry args={[4, 3, 4]} />
      </mesh>
      <mesh position={[-2.2, 0.5, 0]} material={materials.iron} castShadow>
        <boxGeometry args={[0.5, 2, 1]} />
      </mesh>
    </group>
  )
}

function Toolbox({ materials }: { materials: WorkshopMaterials }) {
  return (
    <group position={[0, -75 + 9, 0]}>
      <mesh material={materials.red} castShadow receiveShadow>
        <boxGeometry args={[40, 18, 20]} />
      </mesh>
      <mesh position={[0, 10, 0]} rotation={[0, 0, Math.PI / 2]} material={materials.iron} castShadow>
        <torusGeometry args={[8, 0.8, 12, 20, Math.PI]} />
      </mesh>
      <mesh position={[-12, 2, 10.3]} material={materials.steel} castShadow>
        <boxGeometry args={[3, 3, 0.6]} />
      </mesh>
      <mesh position={[12, 2, 10.3]} material={materials.steel} castShadow>
        <boxGeometry args={[3, 3, 0.6]} />
      </mesh>
    </group>
  )
}

function ToolCabinet({ materials }: { materials: WorkshopMaterials }) {
  const drawerHeight = 90 / 6
  return (
    <group position={[0, -75 + 45, 0]}>
      <mesh material={materials.red} castShadow receiveShadow>
        <boxGeometry args={[70, 90, 45]} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => {
        const y = -45 + drawerHeight * (i + 1)
        return (
          <group key={i} position={[0, y, 22.8]}>
            <mesh material={materials.iron} castShadow>
              <boxGeometry args={[62, drawerHeight - 2, 1]} />
            </mesh>
            <mesh position={[0, 0, 0.8]} material={materials.steel} castShadow>
              <boxGeometry args={[20, 1, 1]} />
            </mesh>
          </group>
        )
      })}
      {[
        [-30, -35],
        [30, -35],
        [-30, 35],
        [30, 35],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, -47, z]} rotation={[Math.PI / 2, 0, 0]} material={materials.iron} castShadow receiveShadow>
          <cylinderGeometry args={[4, 4, 4, 16]} />
        </mesh>
      ))}
    </group>
  )
}

function Sawhorses({ materials }: { materials: WorkshopMaterials }) {
  return (
    <group>
      <Trestle x={-30} materials={materials} />
      <Trestle x={30} materials={materials} />
      <mesh position={[0, -75 + 58, 0]} material={materials.oak} castShadow receiveShadow>
        <boxGeometry args={[100, 3, 14]} />
      </mesh>
    </group>
  )
}

function Trestle({ x, materials }: { x: number; materials: WorkshopMaterials }) {
  const legAngle = 0.3
  const legPositions: Array<[number, number]> = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ]
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, -75 + 54, 0]} material={materials.oak} castShadow receiveShadow>
        <boxGeometry args={[8, 6, 16]} />
      </mesh>
      {legPositions.map(([dx, dz], i) => (
        <mesh
          key={i}
          position={[dx * 5, -75 + 26, dz * 5]}
          rotation={[0, 0, dx * legAngle]}
          material={materials.oak}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[2.5, 54, 2.5]} />
        </mesh>
      ))}
    </group>
  )
}
