/*
 * Build-mode editor: a pure reducer over EditorState, backed by placement.ts's resolution rules.
 */

import { PIECES } from './pieces.ts'
import { posesAlongPath, resolveCandidate, settleHeights, snapAngle, ROTATE_STEP, GRID } from './placement.ts'
import type { EditorAction, EditorState, LevelDef, PlaceableKind, PlacedPiece } from './types.ts'

export const HISTORY_LIMIT = 100

/** The first free "pN" id number after the pieces in `placed`. */
function nextIdAfter(placed: PlacedPiece[]): number {
  let max = 0
  for (const piece of placed) {
    const match = /^p(\d+)$/.exec(piece.id)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return max + 1
}

export function initialEditor(placed: PlacedPiece[] = []): EditorState {
  return {
    placed,
    tool: null,
    toolRotY: 0,
    ghost: null,
    selectedId: null,
    past: [],
    future: [],
    dragOrigin: null,
    nextId: nextIdAfter(placed),
  }
}

export function allPieces(level: LevelDef, state: EditorState): PlacedPiece[] {
  return [...level.fixtures, ...state.placed]
}

function pushHistory(state: EditorState, before: PlacedPiece[]): { past: PlacedPiece[][]; future: PlacedPiece[][] } {
  const past = [...state.past, before]
  if (past.length > HISTORY_LIMIT) past.shift()
  return { past, future: [] }
}

function reresolveGhost(level: LevelDef, state: EditorState): EditorState['ghost'] {
  if (!state.tool || !state.ghost) return null
  const candidate = resolveCandidate(
    level,
    state.placed,
    state.tool,
    state.ghost.x,
    state.ghost.z,
    state.toolRotY,
    'ghost',
  )
  return {
    kind: state.tool,
    x: candidate.piece.x,
    y: candidate.piece.y,
    z: candidate.piece.z,
    rotY: candidate.piece.rotY,
    valid: candidate.ok,
    problem: candidate.problem,
  }
}

function afterLayoutChange(level: LevelDef, state: EditorState): EditorState {
  const settled = settleHeights(level, state.placed)
  const next = settled === state.placed ? state : { ...state, placed: settled }
  const ghost = reresolveGhost(level, next)
  return ghost === next.ghost ? next : { ...next, ghost }
}

export function editorReducer(level: LevelDef, state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'selectTool': {
      if (state.tool === action.kind && state.ghost === null) return state
      return { ...state, tool: action.kind, selectedId: null, ghost: null }
    }

    case 'hover': {
      if (!state.tool) return state
      const candidate = resolveCandidate(level, state.placed, state.tool, action.x, action.z, state.toolRotY, 'ghost')
      const ghost = {
        kind: state.tool,
        x: candidate.piece.x,
        y: candidate.piece.y,
        z: candidate.piece.z,
        rotY: candidate.piece.rotY,
        valid: candidate.ok,
        problem: candidate.problem,
      }
      return { ...state, ghost }
    }

    case 'clearGhost': {
      if (state.ghost === null) return state
      return { ...state, ghost: null }
    }

    case 'nudge': {
      if (state.tool) {
        const base = state.ghost ?? { x: 0, z: 0 }
        const x = base.x + GRID * action.dx
        const z = base.z + GRID * action.dz
        const candidate = resolveCandidate(level, state.placed, state.tool, x, z, state.toolRotY, 'ghost')
        return {
          ...state,
          ghost: {
            kind: state.tool,
            x: candidate.piece.x,
            y: candidate.piece.y,
            z: candidate.piece.z,
            rotY: candidate.piece.rotY,
            valid: candidate.ok,
            problem: candidate.problem,
          },
        }
      }
      if (state.selectedId) {
        const piece = state.placed.find((p) => p.id === state.selectedId)
        if (!piece) return state
        const x = piece.x + GRID * action.dx
        const z = piece.z + GRID * action.dz
        const candidate = resolveCandidate(level, state.placed, piece.kind as PlaceableKind, x, z, piece.rotY, piece.id, piece.id)
        if (!candidate.ok) return state
        const before = state.placed
        const placed = state.placed.map((p) => (p.id === piece.id ? candidate.piece : p))
        const { past, future } = pushHistory(state, before)
        return afterLayoutChange(level, { ...state, placed, past, future })
      }
      return state
    }

    case 'placeAtGhost': {
      if (!state.tool || !state.ghost || !state.ghost.valid) return state
      const before = state.placed
      const id = `p${state.nextId}`
      const newPiece: PlacedPiece = {
        id,
        kind: state.ghost.kind,
        x: state.ghost.x,
        y: state.ghost.y,
        z: state.ghost.z,
        rotY: state.ghost.rotY,
      }
      const placed = [...state.placed, newPiece]
      const { past, future } = pushHistory(state, before)
      const nextState = { ...state, placed, past, future, nextId: state.nextId + 1 }
      return afterLayoutChange(level, nextState)
    }

    case 'placePath': {
      if (!state.tool) return state
      const tool = state.tool
      const pieceDef = PIECES[tool]
      const points = action.points
      if (points.length === 0) return state

      function pathLength(pts: [number, number][]): number {
        let len = 0
        for (let i = 1; i < pts.length; i++) {
          len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
        }
        return len
      }

      const spacing = pieceDef.pathSpacing ?? 6
      const isDomino = tool === 'domino' || tool === 'tallDomino'
      const totalLen = pathLength(points)
      const usePath = isDomino && totalLen >= spacing / 2

      const poses: { x: number; z: number; rotY: number }[] = usePath
        ? posesAlongPath(points, spacing)
        : [{ x: points[0][0], z: points[0][1], rotY: state.toolRotY }]

      let placed = state.placed
      let nextId = state.nextId
      let placedAny = false
      for (const pose of poses) {
        const candidate = resolveCandidate(
          level,
          placed,
          tool,
          pose.x,
          pose.z,
          pose.rotY,
          `p${nextId}`,
          undefined,
          { snap: !usePath },
        )
        if (!candidate.ok) {
          if (candidate.problem === 'inventory') break
          continue
        }
        placed = [...placed, candidate.piece]
        nextId += 1
        placedAny = true
      }

      if (!placedAny) return state
      const before = state.placed
      const { past, future } = pushHistory(state, before)
      return afterLayoutChange(level, { ...state, placed, nextId, past, future })
    }

    case 'select': {
      if (action.id === null) {
        if (state.selectedId === null && state.tool === null && state.ghost === null) return state
        return { ...state, selectedId: null, tool: null, ghost: null }
      }
      const piece = state.placed.find((p) => p.id === action.id)
      if (!piece || piece.locked) {
        if (state.selectedId === null && state.tool === null && state.ghost === null) return state
        return { ...state, selectedId: null, tool: null, ghost: null }
      }
      return { ...state, selectedId: action.id, tool: null, ghost: null }
    }

    case 'move': {
      const piece = state.placed.find((p) => p.id === action.id)
      if (!piece || piece.locked) return state
      const originalPlaced = state.placed
      const candidate = resolveCandidate(level, state.placed, piece.kind as PlaceableKind, action.x, action.z, piece.rotY, piece.id, piece.id)
      const placed = candidate.ok ? state.placed.map((p) => (p.id === piece.id ? candidate.piece : p)) : state.placed

      if (!action.commit) {
        const dragOrigin = state.dragOrigin ?? originalPlaced
        if (placed === state.placed && dragOrigin === state.dragOrigin) return state
        return { ...state, placed, dragOrigin }
      }

      const before = state.dragOrigin ?? originalPlaced
      const changed = JSON.stringify(before) !== JSON.stringify(placed)
      if (!changed) {
        return afterLayoutChange(level, { ...state, placed, dragOrigin: null })
      }
      const past = [...state.past, before]
      if (past.length > HISTORY_LIMIT) past.shift()
      return afterLayoutChange(level, { ...state, placed, past, future: [], dragOrigin: null })
    }

    case 'rotate': {
      if (state.selectedId) {
        const piece = state.placed.find((p) => p.id === state.selectedId)
        if (!piece || piece.locked) return state
        const rotY = snapAngle(piece.rotY + action.steps * ROTATE_STEP)
        const candidate = resolveCandidate(level, state.placed, piece.kind as PlaceableKind, piece.x, piece.z, rotY, piece.id, piece.id)
        if (!candidate.ok) return state
        const before = state.placed
        const placed = state.placed.map((p) => (p.id === piece.id ? candidate.piece : p))
        const { past, future } = pushHistory(state, before)
        return afterLayoutChange(level, { ...state, placed, past, future })
      }
      const toolRotY = snapAngle(state.toolRotY + action.steps * ROTATE_STEP)
      const nextState = { ...state, toolRotY }
      const ghost = reresolveGhost(level, nextState)
      return { ...nextState, ghost }
    }

    case 'remove': {
      const piece = state.placed.find((p) => p.id === action.id)
      if (!piece || piece.locked) return state
      const before = state.placed
      const placed = state.placed.filter((p) => p.id !== action.id)
      const { past, future } = pushHistory(state, before)
      const selectedId = state.selectedId === action.id ? null : state.selectedId
      return afterLayoutChange(level, { ...state, placed, past, future, selectedId })
    }

    case 'removeSelected': {
      if (!state.selectedId) return state
      const piece = state.placed.find((p) => p.id === state.selectedId)
      if (!piece || piece.locked) return state
      const before = state.placed
      const placed = state.placed.filter((p) => p.id !== state.selectedId)
      const { past, future } = pushHistory(state, before)
      return afterLayoutChange(level, { ...state, placed, past, future, selectedId: null })
    }

    case 'clearAll': {
      if (state.placed.length === 0) return state
      const before = state.placed
      const { past, future } = pushHistory(state, before)
      return afterLayoutChange(level, { ...state, placed: [], past, future, selectedId: null })
    }

    case 'undo': {
      if (state.past.length === 0) return state
      const before = state.past[state.past.length - 1]
      const past = state.past.slice(0, -1)
      const future = [...state.future, state.placed]
      if (future.length > HISTORY_LIMIT) future.shift()
      const selectedId = state.selectedId !== null && before.some((p) => p.id === state.selectedId) ? state.selectedId : null
      return afterLayoutChange(level, { ...state, placed: before, past, future, selectedId })
    }

    case 'redo': {
      if (state.future.length === 0) return state
      const next = state.future[state.future.length - 1]
      const future = state.future.slice(0, -1)
      const past = [...state.past, state.placed]
      if (past.length > HISTORY_LIMIT) past.shift()
      const selectedId = state.selectedId !== null && next.some((p) => p.id === state.selectedId) ? state.selectedId : null
      return afterLayoutChange(level, { ...state, placed: next, past, future, selectedId })
    }

    case 'load': {
      const before = state.placed
      const { past, future } = pushHistory(state, before)
      const nextId = Math.max(state.nextId, nextIdAfter(action.placed))
      return afterLayoutChange(level, { ...state, placed: action.placed, past, future, nextId, selectedId: null, tool: null, ghost: null })
    }

    case 'reset':
      return afterLayoutChange(level, initialEditor(action.placed))

    default:
      return state
  }
}
