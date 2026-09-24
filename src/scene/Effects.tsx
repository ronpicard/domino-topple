/*
 * Post-processing stack (tiered by quality) plus the confetti burst and ring flash played when
 * the goal lights up. Self-contained: GameCanvas only feeds it quality/goalBurst/reducedMotion.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import type { QualityTier, Vec3 } from '../game/types.ts'

export interface GoalBurst {
  position: Vec3
  key: number
}

export interface EffectsProps {
  quality: QualityTier
  goalBurst: GoalBurst | null
  reducedMotion: boolean
}

const CONFETTI_COUNT = 160
const CONFETTI_COLORS = ['#ff6b6b', '#ffb84d', '#ffe066', '#6bd66b', '#4dabf7', '#b197fc']
const CONFETTI_LIFE = 2.5
const RING_LIFE = 0.6

export function Effects({ quality, goalBurst, reducedMotion }: EffectsProps) {
  return (
    <>
      {quality === 'high' && (
        <EffectComposer multisampling={0} enableNormalPass>
          <N8AO aoRadius={6} intensity={1.4} halfRes />
          <Bloom luminanceThreshold={1.2} intensity={0.5} mipmapBlur />
          <SMAA />
          <Vignette darkness={0.35} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      )}
      {quality === 'medium' && (
        <EffectComposer>
          <Bloom luminanceThreshold={1.2} intensity={0.5} mipmapBlur />
          <Vignette darkness={0.35} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      )}
      <ConfettiBurst goalBurst={goalBurst} reducedMotion={reducedMotion} />
      <GoalRingFlash goalBurst={goalBurst} />
    </>
  )
}

interface Particle {
  pos: THREE.Vector3
  vel: THREE.Vector3
  spin: THREE.Vector3
  rot: THREE.Euler
}

function ConfettiBurst({ goalBurst, reducedMotion }: { goalBurst: GoalBurst | null; reducedMotion: boolean }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const particlesRef = useRef<Particle[]>([])
  const ageRef = useRef(0)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const palette = CONFETTI_COLORS.map((c) => new THREE.Color(c))
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      mesh.setColorAt(i, palette[i % palette.length])
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [])

  useEffect(() => {
    if (!goalBurst) return
    const count = reducedMotion ? 20 : CONFETTI_COUNT
    const list: Particle[] = []
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 40 + Math.random() * 70
      list.push({
        pos: new THREE.Vector3(...goalBurst.position),
        vel: new THREE.Vector3(Math.cos(angle) * speed * 0.5, 70 + Math.random() * 90, Math.sin(angle) * speed * 0.5),
        spin: reducedMotion
          ? new THREE.Vector3(0, 0, 0)
          : new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9),
        rot: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
      })
    }
    particlesRef.current = list
    ageRef.current = 0
  }, [goalBurst, reducedMotion])

  useFrame((_state, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    const particles = particlesRef.current
    // Hidden between bursts: the instances start as identity matrices at the origin.
    mesh.visible = particles.length > 0
    if (particles.length === 0) return
    ageRef.current += delta
    const t = ageRef.current
    if (t > CONFETTI_LIFE) {
      particlesRef.current = []
      for (let i = 0; i < CONFETTI_COUNT; i++) {
        dummy.position.set(0, -1000, 0)
        dummy.scale.setScalar(0)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
      return
    }
    const gravity = -260
    const fade = Math.max(0, 1 - t / CONFETTI_LIFE)
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      const p = particles[i]
      if (!p) {
        dummy.position.set(0, -1000, 0)
        dummy.scale.setScalar(0)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        continue
      }
      p.vel.y += gravity * delta
      p.pos.addScaledVector(p.vel, delta)
      p.rot.x += p.spin.x * delta
      p.rot.y += p.spin.y * delta
      p.rot.z += p.spin.z * delta
      dummy.position.copy(p.pos)
      dummy.rotation.copy(p.rot)
      dummy.scale.setScalar(0.6 * fade)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, CONFETTI_COUNT]} frustumCulled={false} visible={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial transparent opacity={0.95} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  )
}

function GoalRingFlash({ goalBurst }: { goalBurst: GoalBurst | null }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const materialRef = useRef<THREE.MeshBasicMaterial>(null)
  const ageRef = useRef<number | null>(null)

  useEffect(() => {
    ageRef.current = goalBurst ? 0 : null
  }, [goalBurst])

  useFrame((_state, delta) => {
    const mesh = meshRef.current
    const material = materialRef.current
    if (!mesh || !material) return
    if (ageRef.current === null) {
      mesh.visible = false
      return
    }
    ageRef.current += delta
    const t = ageRef.current
    if (t > RING_LIFE) {
      mesh.visible = false
      ageRef.current = null
      return
    }
    if (goalBurst) mesh.position.set(goalBurst.position[0], 0.1, goalBurst.position[2])
    mesh.visible = true
    const k = t / RING_LIFE
    mesh.scale.setScalar(1 + k * 16)
    material.opacity = (1 - k) * 0.6
  })

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.7, 1, 48]} />
      <meshBasicMaterial ref={materialRef} color="#ffe066" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}
