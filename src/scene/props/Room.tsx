/*
 * The room shell around the table: a circular floor, a cylindrical wall rendered from the
 * inside with a vertical gradient, a ceiling disc, and a baseboard trim ring where they meet.
 *
 * The wall and ceiling are unlit backdrops (their gradient is painted into vertex colours): the
 * scene's lights are sized for the table, so a lit wall this far out came back nearly black.
 *
 * The shell's dimensions are exported so the camera rig (controls.tsx) can keep the eye inside
 * it and the chapter prop sets can hang things on the wall.
 */

import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

export interface RoomColors {
  wall: string
  wallBottom: string
  floor: string
  trim: string
}

export const ROOM_FLOOR_Y = -75
export const ROOM_RADIUS = 800
const WALL_HEIGHT = 700
export const ROOM_CEILING_Y = ROOM_FLOOR_Y + WALL_HEIGHT

const FLOOR_Y = ROOM_FLOOR_Y
const WALL_RADIUS = ROOM_RADIUS

export function Room({ colors }: { colors: RoomColors }) {
  const wallGeometry = useMemo(() => {
    const geo = new THREE.CylinderGeometry(WALL_RADIUS, WALL_RADIUS, WALL_HEIGHT, 64, 1, true)
    const position = geo.attributes.position
    const colorArray = new Float32Array(position.count * 3)
    const top = new THREE.Color(colors.wall)
    const bottom = new THREE.Color(colors.wallBottom)
    const mixed = new THREE.Color()
    for (let i = 0; i < position.count; i++) {
      // Shadowed skirting for the first 1.5 m, then the wall colour, fading off again up high.
      const y = position.getY(i) + WALL_HEIGHT / 2
      const rise = THREE.MathUtils.smoothstep(y, 0, 150)
      const fall = 1 - 0.5 * THREE.MathUtils.smoothstep(y, 250, WALL_HEIGHT)
      mixed.copy(bottom).lerp(top, rise * fall)
      colorArray[i * 3] = mixed.r
      colorArray[i * 3 + 1] = mixed.g
      colorArray[i * 3 + 2] = mixed.b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colorArray, 3))
    return geo
  }, [colors.wall, colors.wallBottom])

  useEffect(() => () => wallGeometry.dispose(), [wallGeometry])

  return (
    <group>
      <mesh position={[0, FLOOR_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[WALL_RADIUS + 1, 64]} />
        <meshStandardMaterial color={colors.floor} roughness={0.9} />
      </mesh>

      <mesh geometry={wallGeometry} position={[0, FLOOR_Y + WALL_HEIGHT / 2, 0]} receiveShadow={false} castShadow={false}>
        <meshBasicMaterial vertexColors side={THREE.BackSide} fog />
      </mesh>

      <mesh position={[0, FLOOR_Y + WALL_HEIGHT, 0]} rotation={[Math.PI / 2, 0, 0]} receiveShadow={false} castShadow={false}>
        <circleGeometry args={[WALL_RADIUS + 1, 64]} />
        <meshBasicMaterial color={colors.wallBottom} />
      </mesh>

      <mesh position={[0, FLOOR_Y + 3, 0]} receiveShadow={false} castShadow={false}>
        <cylinderGeometry args={[WALL_RADIUS + 0.5, WALL_RADIUS + 0.5, 6, 64, 1, true]} />
        <meshStandardMaterial color={colors.trim} roughness={0.8} side={THREE.BackSide} />
      </mesh>
    </group>
  )
}
