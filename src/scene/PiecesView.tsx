/*
 * Renders every piece on the table (level fixtures + player-placed pieces): individual parts via
 * PartMesh, except domino/tallDomino bodies which render through instanced meshes for scale. Reads
 * live physics transforms from SimContext during a run, animates new build-mode pieces dropping
 * in, renders the placement ghost, and raises the goal material's glow when the goal is reached.
 * Also marks meshes with `userData.pieceId` / `userData.instancePieceIds` for controls.tsx's
 * raycast-based hit-testing (see its `pieceIdOf`).
 */

import { useContext, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { PIECES, partWorldPose } from '../game/pieces.ts'
import type { ChapterId, EditorState, Ghost, LevelDef, MaterialKey, PlacedPiece, PlaceableKind, Quat, Vec3 } from '../game/types.ts'
import type { Simulation } from '../game/sim.ts'
import type { PlayMode } from './sceneApi.ts'
import { SimContext } from './sceneApi.ts'
import { PartMesh } from './PartMesh.tsx'
import { dominoPipTexture, useThemeMaterials } from './materials.ts'
import type { ChapterTheme } from './themes.ts'
import { THEMES } from './themes.ts'
import type { QualityTier } from '../game/types.ts'

export interface PiecesViewProps {
  level: LevelDef
  chapter: ChapterId
  /** Fixtures then placed, as built by `allPieces` (../game/editor.ts). */
  pieces: PlacedPiece[]
  mode: PlayMode
  editor: EditorState
  /** True while the goal material's glow should be rising (set by the owner on a RunEvent 'goal'). */
  goalLit: boolean
  quality: QualityTier
  /**
   * Skips the build-mode "drop in" animation for newly placed pieces. Optional: SceneProps already
   * carries this at the top level, but PiecesView's contracted signature does not — defaults false
   * so the animation plays unless a caller opts in.
   */
  reducedMotion?: boolean
}

/** How long a freshly-placed piece takes to spring down from its drop height. */
const DROP_HEIGHT = 6
const DROP_DURATION = 0.35
const DROP_OMEGA = 13

/** Critically-damped fall from DROP_HEIGHT to 0 over roughly DROP_DURATION seconds. */
function dropOffset(t: number): number {
  if (t <= 0) return DROP_HEIGHT
  return DROP_HEIGHT * Math.exp(-DROP_OMEGA * t) * (1 + DROP_OMEGA * t)
}

const DOMINO_KINDS: ('domino' | 'tallDomino')[] = ['domino', 'tallDomino']

export function PiecesView({ level: _level, chapter, pieces, mode, editor, goalLit, quality, reducedMotion = false }: PiecesViewProps) {
  const materials = useThemeMaterials(chapter, quality)
  const theme = THEMES[chapter]
  const { clock } = useThree()

  // Track when each currently-placed piece id first appeared, for the build-mode drop-in.
  const dropStarts = useRef(new Map<string, number>())
  const knownIds = useRef(new Set<string>())
  useEffect(() => {
    if (mode !== 'build') return
    const currentIds = new Set<string>()
    for (const p of editor.placed) {
      currentIds.add(p.id)
      if (!knownIds.current.has(p.id)) {
        knownIds.current.add(p.id)
        if (!reducedMotion) dropStarts.current.set(p.id, clock.elapsedTime)
      }
    }
    for (const id of knownIds.current) {
      if (!currentIds.has(id)) {
        knownIds.current.delete(id)
        dropStarts.current.delete(id)
      }
    }
  }, [editor.placed, mode, reducedMotion, clock])

  // Goal glow: snap up to 1.5 when lit, ease back down to 0.4 over 2s; reset to 0 when unlit.
  const litAt = useRef<number | null>(null)
  useEffect(() => {
    const goal = materials.goal as THREE.MeshStandardMaterial
    if (goalLit) {
      litAt.current = clock.elapsedTime
      goal.emissiveIntensity = 1.5
    } else {
      litAt.current = null
      goal.emissiveIntensity = 0
    }
  }, [goalLit, materials, clock])
  useFrame(() => {
    if (litAt.current === null) return
    const goal = materials.goal as THREE.MeshStandardMaterial
    const t = clock.elapsedTime - litAt.current
    goal.emissiveIntensity = t >= 2 ? 0.4 : THREE.MathUtils.lerp(1.5, 0.4, Math.min(t / 2, 1))
  })

  const dominoesByKind = useMemo(() => {
    const map = new Map<'domino' | 'tallDomino', PlacedPiece[]>([
      ['domino', []],
      ['tallDomino', []],
    ])
    for (const p of pieces) {
      if (p.kind === 'domino' || p.kind === 'tallDomino') map.get(p.kind)!.push(p)
    }
    return map
  }, [pieces])

  const otherPieces = useMemo(() => pieces.filter((p) => p.kind !== 'domino' && p.kind !== 'tallDomino'), [pieces])

  return (
    <group>
      {otherPieces.map((piece) => (
        <PieceGroup
          key={piece.id}
          piece={piece}
          materials={materials}
          mode={mode}
          selected={editor.selectedId === piece.id}
          reducedMotion={reducedMotion}
          dropStarts={dropStarts.current}
        />
      ))}
      {DOMINO_KINDS.map((kind) => (
        <DominoInstances
          key={kind}
          kind={kind}
          pieces={dominoesByKind.get(kind) ?? []}
          materials={materials}
          theme={theme}
          mode={mode}
          reducedMotion={reducedMotion}
          dropStarts={dropStarts.current}
          selectedId={mode === 'build' ? editor.selectedId : null}
        />
      ))}
      {editor.ghost && <GhostPieces ghost={editor.ghost} materials={materials} />}
    </group>
  )
}

// ---------------------------------------------------------------------------------------------
// A single non-domino piece: renders its parts via PartMesh and, during a run, imperatively
// drives each dynamic part's group transform from the live simulation.

function PieceGroup({
  piece,
  materials,
  mode,
  selected,
  reducedMotion,
  dropStarts,
}: {
  piece: PlacedPiece
  materials: Record<MaterialKey, THREE.Material>
  mode: PlayMode
  selected: boolean
  reducedMotion: boolean
  dropStarts: Map<string, number>
}) {
  const def = PIECES[piece.kind]
  const partRefs = useRef<(THREE.Group | null)[]>([])
  const dropRef = useRef<THREE.Group>(null)
  const simCtx = useContext(SimContext)
  const simMap = useRef<{ sim: Simulation | null; byPart: Map<number, number> }>({ sim: null, byPart: new Map() })

  useFrame((state) => {
    const sim = simCtx.current
    if ((mode === 'run' || mode === 'result') && sim) {
      if (sim !== simMap.current.sim) {
        const byPart = new Map<number, number>()
        sim.bodies.forEach((b, i) => {
          if (b.pieceId === piece.id) byPart.set(b.partIndex, i)
        })
        simMap.current = { sim, byPart }
      }
      const t = sim.transforms
      def.parts.forEach((part, pi) => {
        if (part.body !== 'dynamic') return
        const group = partRefs.current[pi]
        const idx = simMap.current.byPart.get(pi)
        if (!group || idx === undefined) return
        const o = idx * 7
        group.position.set(t[o], t[o + 1], t[o + 2])
        group.quaternion.set(t[o + 3], t[o + 4], t[o + 5], t[o + 6])
      })
    } else if (mode === 'build') {
      if (simMap.current.sim !== null) simMap.current = { sim: null, byPart: new Map() }
      const start = dropStarts.get(piece.id)
      if (dropRef.current) {
        if (!reducedMotion && start !== undefined) {
          const t = state.clock.elapsedTime - start
          dropRef.current.position.y = t >= 0 && t < DROP_DURATION ? dropOffset(t) : 0
        } else if (dropRef.current.position.y !== 0) {
          dropRef.current.position.y = 0
        }
      }
    }
  })

  return (
    <group ref={dropRef} userData={{ pieceId: piece.id }}>
      {def.parts.map((part, pi) => (
        <PartMesh
          key={part.name}
          ref={(g) => {
            partRefs.current[pi] = g
          }}
          piece={piece}
          partIndex={pi}
          materials={materials}
          selected={selected}
        />
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------------------------
// Dominoes: rendered through one InstancedMesh per kind for the bodies plus one for their pip
// planes (two instances per domino, one per ±X face).

const SELECTED_TINT = new THREE.Color('#f6b73c')

function DominoInstances({
  kind,
  pieces,
  materials,
  theme,
  mode,
  reducedMotion,
  dropStarts,
  selectedId,
}: {
  kind: 'domino' | 'tallDomino'
  pieces: PlacedPiece[]
  materials: Record<MaterialKey, THREE.Material>
  theme: ChapterTheme
  mode: PlayMode
  reducedMotion: boolean
  dropStarts: Map<string, number>
  selectedId: string | null
}) {
  const def = PIECES[kind]
  const part = def.parts[0]
  const half = def.halfExtents
  const collider = part.colliders[0]
  const physicsRadius = collider && collider.shape.type === 'box' ? (collider.shape.radius ?? 0) : 0

  const bodyGeometry = useMemo(
    () => new RoundedBoxGeometry(2 * half[0], 2 * half[1], 2 * half[2], 2, physicsRadius > 0 ? physicsRadius : 0.15),
    [half, physicsRadius],
  )
  const pipGeometry = useMemo(() => new THREE.PlaneGeometry(half[2] * 1.5, half[1] * 1.5), [half])
  const pipTexture = useMemo(() => dominoPipTexture(theme.dominoPip), [theme.dominoPip])
  const pipMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: pipTexture,
        transparent: true,
        alphaTest: 0.4,
        roughness: 0.45,
        metalness: 0.05,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    [pipTexture],
  )
  useEffect(
    () => () => {
      bodyGeometry.dispose()
      pipGeometry.dispose()
      pipMaterial.dispose()
    },
    [bodyGeometry, pipGeometry, pipMaterial],
  )

  const palette = useMemo(() => theme.dominoBody.map((c) => new THREE.Color(c)), [theme.dominoBody])
  const count = Math.max(64, pieces.length)
  const bodyArgs = useMemo(
    () => [bodyGeometry, materials[part.material], count] as const,
    [bodyGeometry, materials, part.material, count],
  )
  const pipArgs = useMemo(() => [pipGeometry, pipMaterial, count * 2] as const, [pipGeometry, pipMaterial, count])

  const bodyRef = useRef<THREE.InstancedMesh>(null)
  const pipRef = useRef<THREE.InstancedMesh>(null)
  const simCtx = useContext(SimContext)
  const simMap = useRef<{ sim: Simulation | null; byId: Map<string, number> }>({ sim: null, byId: new Map() })

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const bodyPos = useMemo(() => new THREE.Vector3(), [])
  const bodyQuat = useMemo(() => new THREE.Quaternion(), [])
  const faceOffset = useMemo(() => new THREE.Vector3(), [])
  const faceQuatA = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), [])
  const faceQuatB = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0)), [])

  useFrame((state) => {
    const body = bodyRef.current
    const pip = pipRef.current
    if (!body || !pip) return
    const sim = simCtx.current
    const running = (mode === 'run' || mode === 'result') && sim
    if (running && sim !== simMap.current.sim) {
      const byId = new Map<string, number>()
      sim.bodies.forEach((b, i) => {
        if (b.kind === kind) byId.set(b.pieceId, i)
      })
      simMap.current = { sim, byId }
    } else if (!running && simMap.current.sim !== null) {
      simMap.current = { sim: null, byId: new Map() }
    }

    const elapsed = state.clock.elapsedTime
    const bodyIds: string[] = new Array(count)
    const pipIds: string[] = new Array(count * 2)

    for (let i = 0; i < count; i++) {
      const piece = pieces[i]
      if (!piece) {
        bodyIds[i] = ''
        pipIds[i * 2] = ''
        pipIds[i * 2 + 1] = ''
        dummy.position.set(0, -1000, 0)
        dummy.quaternion.identity()
        dummy.updateMatrix()
        body.setMatrixAt(i, dummy.matrix)
        pip.setMatrixAt(i * 2, dummy.matrix)
        pip.setMatrixAt(i * 2 + 1, dummy.matrix)
        continue
      }
      bodyIds[i] = piece.id
      pipIds[i * 2] = piece.id
      pipIds[i * 2 + 1] = piece.id

      let position: Vec3
      let rotation: Quat
      const simIdx = running ? simMap.current.byId.get(piece.id) : undefined
      if (simIdx !== undefined && sim) {
        const o = simIdx * 7
        const t = sim.transforms
        position = [t[o], t[o + 1], t[o + 2]]
        rotation = [t[o + 3], t[o + 4], t[o + 5], t[o + 6]]
      } else {
        const pose = partWorldPose(piece, part)
        position = pose.position
        rotation = pose.rotation
        if (mode === 'build' && !reducedMotion) {
          const start = dropStarts.get(piece.id)
          if (start !== undefined) {
            const t = elapsed - start
            if (t >= 0 && t < DROP_DURATION) position = [position[0], position[1] + dropOffset(t), position[2]]
          }
        }
      }

      bodyPos.set(position[0], position[1], position[2])
      bodyQuat.set(rotation[0], rotation[1], rotation[2], rotation[3])
      dummy.position.copy(bodyPos)
      dummy.quaternion.copy(bodyQuat)
      dummy.updateMatrix()
      body.setMatrixAt(i, dummy.matrix)
      // Instanced dominoes cannot carry the outline mesh, so a selected one is tinted instead.
      body.setColorAt(i, piece.id === selectedId ? SELECTED_TINT : palette[i % palette.length])

      faceOffset.set(half[0] + 0.01, 0, 0).applyQuaternion(bodyQuat)
      dummy.position.copy(bodyPos).add(faceOffset)
      dummy.quaternion.copy(bodyQuat).multiply(faceQuatA)
      dummy.updateMatrix()
      pip.setMatrixAt(i * 2, dummy.matrix)

      faceOffset.set(-half[0] - 0.01, 0, 0).applyQuaternion(bodyQuat)
      dummy.position.copy(bodyPos).add(faceOffset)
      dummy.quaternion.copy(bodyQuat).multiply(faceQuatB)
      dummy.updateMatrix()
      pip.setMatrixAt(i * 2 + 1, dummy.matrix)
    }

    body.instanceMatrix.needsUpdate = true
    if (body.instanceColor) body.instanceColor.needsUpdate = true
    pip.instanceMatrix.needsUpdate = true
    // InstancedMesh caches its bounds on the first raycast; drop them so hit-testing sees the
    // instances as they are now (it recomputes lazily, only when a raycast happens).
    body.boundingSphere = null
    body.boundingBox = null
    pip.boundingSphere = null
    pip.boundingBox = null
    body.userData.instancePieceIds = bodyIds
    pip.userData.instancePieceIds = pipIds
  })

  return (
    <>
      <instancedMesh ref={bodyRef} args={bodyArgs} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={pipRef} args={pipArgs} castShadow={false} receiveShadow={false} frustumCulled={false} />
    </>
  )
}

// ---------------------------------------------------------------------------------------------
// The translucent placement preview for the tool currently being placed.

function GhostPieces({ ghost, materials }: { ghost: Ghost; materials: Record<MaterialKey, THREE.Material> }) {
  const kind: PlaceableKind = ghost.kind
  const piece = useMemo<PlacedPiece>(
    () => ({ id: '__ghost__', kind, x: ghost.x, y: ghost.y, z: ghost.z, rotY: ghost.rotY }),
    [kind, ghost.x, ghost.y, ghost.z, ghost.rotY],
  )
  const parts = PIECES[kind].parts
  return (
    <>
      {parts.map((part, pi) => (
        <PartMesh key={part.name} piece={piece} partIndex={pi} materials={materials} ghost invalid={!ghost.valid} />
      ))}
    </>
  )
}
