/*
 * Shared contracts for Domino Topple. Pure data types only: no three.js, no React, no Rapier.
 *
 * Units and frames (used everywhere):
 * - 1 world unit = 1 cm. Y is up. The table top is the plane y = 0.
 * - Angles are radians. `rotY` is a right-handed rotation about +Y, the same as three.js
 *   `Object3D.rotation.y`: rotating by θ maps local +X to world (cos θ, 0, -sin θ) and local +Z
 *   to world (sin θ, 0, cos θ).
 * - A piece's pose origin is the centre of its footprint on its support surface (the bottom of
 *   the piece), so `y` is the height of the surface it stands on.
 * - Time is seconds. Gravity is 981 cm/s² downwards.
 */

export type Vec3 = [number, number, number]
/** Quaternion as [x, y, z, w]. */
export type Quat = [number, number, number, number]

export type ChapterId = 'desk' | 'workshop' | 'playroom'

/** Pieces the player can place from the tray. */
export type PlaceableKind =
  | 'domino'
  | 'tallDomino'
  | 'ramp'
  | 'stairs'
  | 'lever'
  | 'marble'
  | 'bridge'
  | 'spring'

/** Pieces that only appear as locked, level-authored fixtures. */
export type FixtureKind =
  | 'pendulum' // start trigger: a hammer on a post, released from a raised angle at GO
  | 'car' // start trigger: a toy car that starts rolling along its local +X at GO
  | 'marbleRamp' // start trigger: a fixed chute with a marble at the top
  | 'bell' // goal: rings when any moving body touches its sensor
  | 'flag' // goal: a standing flag that must be knocked past 45°
  | 'cup' // goal: a cup whose inner sensor must receive a body
  | 'star' // bonus token: a standing coin that must be knocked over or pushed away
  | 'block' // static obstacle
  | 'platform' // static raised deck the player can build on

export type PieceKind = PlaceableKind | FixtureKind

/** One piece on the table, either level-authored (locked) or placed by the player. */
export interface PlacedPiece {
  id: string
  kind: PieceKind
  x: number
  /** Height of the support surface under the piece's origin. */
  y: number
  z: number
  rotY: number
  /** Locked pieces come from the level and cannot be moved, rotated or removed. */
  locked?: boolean
}

export type BodyType = 'fixed' | 'dynamic'

export type PartShape =
  | { type: 'box'; half: Vec3; radius?: number } // radius > 0 means a rounded box (roundCuboid)
  | { type: 'ball'; radius: number }
  | { type: 'cylinder'; halfHeight: number; radius: number } // axis along local +Y
  | { type: 'hull'; points: Vec3[] } // convex hull, in part-local coordinates

/** Visual material keys. The scene maps these to chapter-themed three.js materials. */
export type MaterialKey =
  | 'domino'
  | 'dominoTall'
  | 'wood'
  | 'woodDark'
  | 'metal'
  | 'rubber'
  | 'marble'
  | 'brass'
  | 'cloth'
  | 'plastic'
  | 'spring'
  | 'star'
  | 'goal'

/** A rigid part of a piece. Parts are listed in a fixed order, which the simulation keeps. */
export interface PartDef {
  /** Unique within the piece, e.g. 'body', 'plank', 'fulcrum'. */
  name: string
  body: BodyType
  /** Part centre relative to the piece origin, in the piece's local frame (before rotY). */
  offset: Vec3
  /** Extra local rotation of the part about its own centre, applied before the piece's rotY. */
  rotation?: Quat
  /** Collision shapes (compound), each positioned relative to the part centre. */
  colliders: { shape: PartShape; offset?: Vec3; rotation?: Quat }[]
  /** Density in g/cm³ for dynamic parts. */
  density?: number
  friction?: number
  restitution?: number
  material: MaterialKey
  /** Visual hint for a hand-built mesh; otherwise the scene draws the collider shapes. */
  visual?: string
  /** Sensor-only part (no contact response). */
  sensor?: 'goal' | 'spring'
  /** Goal / bonus conditions evaluated by the simulation. */
  goalOnTopple?: boolean
  starOnTopple?: boolean
  /** Revolute joint to another part of the same piece. Anchors are in each part's local frame. */
  joint?: { to: string; anchorSelf: Vec3; anchorOther: Vec3; axis: Vec3 }
  /** Initial linear velocity at GO, in the piece's local frame. */
  launchVelocity?: Vec3
  /** Continuous collision detection for small, fast parts. */
  ccd?: boolean
}

/** 2D oriented rectangle on the XZ plane, used for placement overlap and supports. */
export interface Footprint {
  cx: number
  cz: number
  /** Half extents along the rectangle's own axes (local X and local Z). */
  hx: number
  hz: number
  rotY: number
}

/** A flat top surface that other pieces can stand on. */
export interface SupportTop {
  footprint: Footprint
  y: number
}

export interface PieceDef {
  kind: PieceKind
  label: string
  /** One sentence shown in the tray tooltip / how-to-play. */
  blurb: string
  parts: PartDef[]
  /**
   * Local half extents (x, y, z) of the piece's placement box. The origin is at its base, so the
   * box spans x ∈ [-hx, hx], y ∈ [0, 2·hy], z ∈ [-hz, hz]. Used for overlap and bounds checks.
   */
  halfExtents: Vec3
  /** Flat surfaces in the piece's local frame (footprint relative to origin, y above origin). */
  supports: { cx: number; cz: number; hx: number; hz: number; y: number }[]
  /** Default spacing between consecutive pieces when drawn as a path. Only for dominoes. */
  pathSpacing?: number
}

export interface CameraView {
  target: Vec3
  /** Distance from target in cm. */
  distance: number
  /** Azimuth in radians; 0 looks from +Z towards -Z. */
  yaw: number
  /** Elevation in radians above the horizon. */
  pitch: number
}

export interface LevelDef {
  id: number
  chapter: ChapterId
  name: string
  /** One-line teaching hint shown when the level opens. */
  hint: string
  /** Table size in cm (x = width, z = depth), centred on the origin. */
  table: { width: number; depth: number }
  /** Locked pieces: at least one trigger and exactly one goal, plus an optional star. */
  fixtures: PlacedPiece[]
  /** Tray counts. -1 means unlimited (sandbox). */
  inventory: Partial<Record<PlaceableKind, number>>
  /** Placed-piece count at or under which the "efficient" star is earned. */
  parPieces: number
  camera: CameraView
  /** A known 3-star layout, verified headlessly by the tests. */
  solution: PlacedPiece[]
}

export interface ChapterDef {
  id: ChapterId
  name: string
  tagline: string
}

// ---------------------------------------------------------------------------------------------
// Simulation

export interface ImpactEvent {
  /** 0..1 loudness, from the relative speed of the two bodies when their contact starts. */
  strength: number
  position: Vec3
  /** Material of the harder-sounding participant. */
  material: MaterialKey
}

export interface StepEvents {
  impacts: ImpactEvent[]
  /** True only on the step where the goal was first reached. */
  goalReached: boolean
  /** True only on the step where the star token was first collected. */
  starCollected: boolean
  /** World positions of spring pads that fired this step. */
  springs: Vec3[]
}

export type RunOutcome = 'running' | 'success' | 'fail'

export interface RunResult {
  outcome: 'success' | 'fail'
  starCollected: boolean
  /** Simulated seconds until the goal (success) or until the run was judged failed. */
  time: number
}

// ---------------------------------------------------------------------------------------------
// Progress and scoring

export interface LevelProgress {
  completed: boolean
  /** Best star count 0..3. */
  stars: number
  /** Fewest placed pieces in a successful run, or null. */
  bestPieces: number | null
}

export interface SaveData {
  version: 1
  levels: Record<number, LevelProgress>
  settings: Settings
  seenCoach: boolean
}

export type QualityTier = 'high' | 'medium' | 'low'

export interface Settings {
  muted: boolean
  /** 'auto' picks a tier from the frame-time probe. */
  quality: QualityTier | 'auto'
  reducedMotion: boolean
}

export type Route = { name: 'menu' } | { name: 'level'; id: number } | { name: 'sandbox' }

// ---------------------------------------------------------------------------------------------
// Build-mode editor (pure reducer in editor.ts)

export type PlacementProblem = 'offTable' | 'overlap' | 'noSupport' | 'inventory' | 'locked'

/** The translucent preview of the piece that would be placed. */
export interface Ghost {
  kind: PlaceableKind
  x: number
  y: number
  z: number
  rotY: number
  valid: boolean
  problem?: PlacementProblem
}

export interface EditorState {
  /** Player-placed pieces only (fixtures live on the level). */
  placed: PlacedPiece[]
  /** Tray tool; null means "select / move" mode. */
  tool: PlaceableKind | null
  /** Rotation the next placed piece will use, in radians (multiples of ROTATE_STEP). */
  toolRotY: number
  ghost: Ghost | null
  /** Selected placed piece (for rotate / delete / keyboard move). */
  selectedId: string | null
  past: PlacedPiece[][]
  future: PlacedPiece[][]
  /** Layout before the current move-drag began (set by the first uncommitted move, cleared on commit). */
  dragOrigin: PlacedPiece[] | null
  /** Monotonic counter for new piece ids ("p1", "p2", ...). */
  nextId: number
}

export type EditorAction =
  | { type: 'selectTool'; kind: PlaceableKind | null }
  /** Pointer or keyboard moved the preview; x/z are raw world coords, snapped by the reducer. */
  | { type: 'hover'; x: number; z: number }
  | { type: 'clearGhost' }
  /** Nudge the ghost (or the selected piece if no tool) by whole grid cells. */
  | { type: 'nudge'; dx: number; dz: number }
  /** Place the current tool at the ghost position (keyboard Enter or a tap). */
  | { type: 'placeAtGhost' }
  /** Lay pieces of the current tool along a dragged polyline of raw world XZ points. */
  | { type: 'placePath'; points: [number, number][] }
  | { type: 'select'; id: string | null }
  /** Move a placed piece to raw world x/z (snapped); commits one undo step when `commit`. */
  | { type: 'move'; id: string; x: number; z: number; commit: boolean }
  /** Rotate the selected piece, or the tool rotation if nothing is selected, by steps of ROTATE_STEP. */
  | { type: 'rotate'; steps: number }
  | { type: 'remove'; id: string }
  | { type: 'removeSelected' }
  | { type: 'clearAll' }
  | { type: 'undo' }
  | { type: 'redo' }
  /** Replace the layout wholesale (e.g. loading a saved layout); one undo step. */
  | { type: 'load'; placed: PlacedPiece[] }
  /** Start over on a new level: this layout, no undo history, no selection. */
  | { type: 'reset'; placed: PlacedPiece[] }
