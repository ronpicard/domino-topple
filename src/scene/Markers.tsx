/*
 * Build-mode scene overlays: floating "Start"/"Goal"/"★ Bonus" tags over fixtures, a pulsing ring
 * on the table under each goal fixture, and the selected-piece action bubble (turn / turn / remove).
 * Hidden entirely outside build mode.
 *
 * The tags and the bubble are plain DOM (`MarkerOverlay`, rendered next to the canvas) positioned
 * every frame by `MarkerProjector` inside the canvas, so they stay crisp and clickable without a
 * separate React root per label. The styling classes (`scene-tag*`, `piece-actions*`) come from
 * styles.css.
 */

import { useContext, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { pieceFootprint, pieceHeightRange } from '../game/pieces.ts'
import type { EditorAction, EditorState, FixtureKind, LevelDef, PlacedPiece, Vec3 } from '../game/types.ts'
import type { PlayMode } from './sceneApi.ts'
import { GestureContext } from './sceneApi.ts'
import { RotateLeftIcon, RotateRightIcon, TrashIcon } from '../ui/icons.tsx'

const START_KINDS = new Set<FixtureKind>(['pendulum', 'car', 'marbleRamp'])
const GOAL_KINDS = new Set<FixtureKind>(['bell', 'flag', 'cup'])

const RING_COLOR = '#f6b73c'
const RING_PERIOD = 1.6
const BUBBLE_KEY = '__bubble__'

/** DOM elements to pin to world points, keyed by fixture id (or BUBBLE_KEY). */
export type MarkerAnchors = Map<string, { el: HTMLElement; pos: Vec3 }>

function reducedMotionActive(): boolean {
  try {
    if (document.documentElement.classList.contains('reduce-motion')) return true
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** The point just above a piece's highest part, where its tag or bubble floats. */
function abovePiece(piece: PlacedPiece, lift: number): Vec3 {
  const footprint = pieceFootprint(piece)
  return [footprint.cx, pieceHeightRange(piece)[1] + lift, footprint.cz]
}

function tagFor(kind: PlacedPiece['kind']): { className: string; text: string } | null {
  if (START_KINDS.has(kind as FixtureKind)) return { className: 'scene-tag scene-tag--start', text: 'Start' }
  if (GOAL_KINDS.has(kind as FixtureKind)) return { className: 'scene-tag scene-tag--goal', text: 'Goal' }
  if (kind === 'star') return { className: 'scene-tag scene-tag--bonus', text: '★ Bonus' }
  return null
}

// ---------------------------------------------------------------------------------------------
// Inside the canvas

function GoalRing({ fixture }: { fixture: PlacedPiece }) {
  const materialRef = useRef<THREE.MeshBasicMaterial>(null)
  const footprint = pieceFootprint(fixture)
  const inner = Math.max(footprint.hx, footprint.hz) + 3
  const outer = inner + 1.2

  useFrame(({ clock }) => {
    const material = materialRef.current
    if (!material) return
    if (reducedMotionActive()) {
      material.opacity = 0.6
      return
    }
    const t = clock.elapsedTime
    material.opacity = 0.575 + 0.225 * Math.sin((2 * Math.PI * t) / RING_PERIOD)
  })

  return (
    <mesh position={[footprint.cx, fixture.y + 0.05, footprint.cz]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[inner, outer, 48]} />
      <meshBasicMaterial ref={materialRef} color={RING_COLOR} transparent depthWrite={false} opacity={0.6} />
    </mesh>
  )
}

/** Goal rings, plus the per-frame projection of every overlay anchor onto the screen. */
export function MarkerProjector({ level, mode, anchors }: { level: LevelDef; mode: PlayMode; anchors: MarkerAnchors }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const gesture = useContext(GestureContext)
  const v = useRef(new THREE.Vector3()).current

  useFrame(() => {
    for (const [key, { el, pos }] of anchors) {
      v.set(pos[0], pos[1], pos[2]).project(camera)
      const hidden = v.z > 1 || (key === BUBBLE_KEY && gesture.current.buildGestureActive)
      el.style.visibility = hidden ? 'hidden' : 'visible'
      if (hidden) continue
      const x = ((v.x + 1) / 2) * size.width
      const y = ((1 - v.y) / 2) * size.height
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`
    }
  })

  if (mode !== 'build') return null
  return (
    <>
      {level.fixtures
        .filter((fixture) => GOAL_KINDS.has(fixture.kind as FixtureKind))
        .map((fixture) => (
          <GoalRing key={fixture.id} fixture={fixture} />
        ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------------
// Next to the canvas (plain DOM)

export function MarkerOverlay({
  level,
  editor,
  dispatch,
  mode,
  anchors,
}: {
  level: LevelDef
  editor: EditorState
  dispatch: (action: EditorAction) => void
  mode: PlayMode
  anchors: MarkerAnchors
}) {
  if (mode !== 'build') return null

  function pin(key: string, pos: Vec3) {
    return (el: HTMLElement | null) => {
      if (!el) return
      anchors.set(key, { el, pos })
      return () => {
        if (anchors.get(key)?.el === el) anchors.delete(key)
      }
    }
  }

  const selected = editor.placed.find((p) => p.id === editor.selectedId)

  return (
    <div className="scene-overlay">
      {level.fixtures.map((fixture) => {
        const tag = tagFor(fixture.kind)
        if (!tag) return null
        return (
          <div
            key={fixture.id}
            className="scene-overlay__anchor"
            ref={pin(fixture.id, abovePiece(fixture, fixture.kind === 'star' ? 3 : 7))}
            aria-hidden="true"
          >
            <div className={tag.className}>{tag.text}</div>
          </div>
        )
      })}
      {selected && (
        <div
          key={selected.id}
          className="scene-overlay__anchor scene-overlay__anchor--interactive"
          ref={pin(BUBBLE_KEY, abovePiece(selected, 10))}
        >
          <div
            className="piece-actions"
            role="toolbar"
            aria-label="Selected piece"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="piece-actions__btn"
              aria-label="Turn left"
              title="Turn left"
              onClick={() => dispatch({ type: 'rotate', steps: -1 })}
            >
              <RotateLeftIcon size={20} />
            </button>
            <button
              type="button"
              className="piece-actions__btn"
              aria-label="Turn right"
              title="Turn right"
              onClick={() => dispatch({ type: 'rotate', steps: 1 })}
            >
              <RotateRightIcon size={20} />
            </button>
            <button
              type="button"
              className="piece-actions__btn piece-actions__btn--danger"
              aria-label="Remove piece"
              title="Remove"
              onClick={() => dispatch({ type: 'removeSelected' })}
            >
              <TrashIcon size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
