/*
 * The piece catalogue: every piece's rigid parts, collision shapes, supports and placement bounds,
 * plus the pure helpers that turn a PlacedPiece into world-space poses. Both the Rapier
 * simulation and the three.js scene build from these definitions, so the physics and the
 * visuals always agree. Units and frames are documented in types.ts.
 */

import type {
  Footprint,
  PartDef,
  PieceDef,
  PieceKind,
  PlaceableKind,
  PlacedPiece,
  Quat,
  SupportTop,
  Vec3,
} from './types.ts'

// ---------------------------------------------------------------------------------------------
// Small quaternion / vector helpers (kept here so game code never needs three.js).

export const IDENTITY_QUAT: Quat = [0, 0, 0, 1]

export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const s = Math.sin(angle / 2)
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)]
}

export function quatFromRotY(rotY: number): Quat {
  return quatFromAxisAngle([0, 1, 0], rotY)
}

/** Hamilton product a * b (apply b first, then a). */
export function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

export function rotateVec(q: Quat, v: Vec3): Vec3 {
  const [qx, qy, qz, qw] = q
  const [vx, vy, vz] = v
  // t = 2 * cross(q.xyz, v); v' = v + w * t + cross(q.xyz, t)
  const tx = 2 * (qy * vz - qz * vy)
  const ty = 2 * (qz * vx - qx * vz)
  const tz = 2 * (qx * vy - qy * vx)
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ]
}

/** Rotate a local XZ offset by rotY (same convention as three.js rotation.y). */
export function rotateXZ(x: number, z: number, rotY: number): [number, number] {
  const c = Math.cos(rotY)
  const s = Math.sin(rotY)
  return [x * c + z * s, -x * s + z * c]
}

// ---------------------------------------------------------------------------------------------
// Catalogue

const Z90: Quat = quatFromAxisAngle([0, 0, 1], Math.PI / 2)
/** Pendulum arm starts raised 60° towards -X and swings towards +X. */
const PENDULUM_START: Quat = quatFromAxisAngle([0, 0, 1], -Math.PI / 3)
/** Marble chute slope: descends 10 cm over 30 cm towards +X. */
const CHUTE_SLOPE = Math.atan2(10, 30)
const CHUTE_TILT: Quat = quatFromAxisAngle([0, 0, 1], -CHUTE_SLOPE)

function box(half: Vec3, offset?: Vec3, radius?: number): PartDef['colliders'][number] {
  return { shape: { type: 'box', half, radius }, offset }
}

const DOMINO_PART = (h: Vec3, material: 'domino' | 'dominoTall'): PartDef => ({
  name: 'body',
  body: 'dynamic',
  offset: [0, h[1], 0],
  colliders: [box(h, undefined, 0.15)],
  density: 0.7,
  friction: 0.45,
  restitution: 0.05,
  material,
  visual: 'domino',
})

export const PIECES: Record<PieceKind, PieceDef> = {
  domino: {
    kind: 'domino',
    label: 'Domino',
    blurb: 'The classic. Tap to place one, or drag to lay a whole row.',
    // 1.2 thick (X, the falling direction) x 8 tall x 4 wide.
    parts: [DOMINO_PART([0.6, 4, 2], 'domino')],
    halfExtents: [0.6, 4, 2],
    supports: [],
    pathSpacing: 4.8,
  },
  tallDomino: {
    kind: 'tallDomino',
    label: 'Tall domino',
    blurb: 'Heavier and taller: reaches further and hits harder.',
    parts: [DOMINO_PART([0.8, 6, 2.5], 'dominoTall')],
    halfExtents: [0.8, 6, 2.5],
    supports: [],
    pathSpacing: 7,
  },
  ramp: {
    kind: 'ramp',
    label: 'Ramp',
    blurb: 'Rolls a marble downhill towards the low end.',
    // Wedge: 8 cm high at -X, 0 at +X, 24 long, 8 wide.
    parts: [
      {
        name: 'wedge',
        body: 'fixed',
        offset: [0, 0, 0],
        colliders: [
          {
            shape: {
              type: 'hull',
              points: [
                [-12, 0, -4],
                [12, 0, -4],
                [-12, 8, -4],
                [-12, 0, 4],
                [12, 0, 4],
                [-12, 8, 4],
              ],
            },
          },
        ],
        friction: 0.5,
        material: 'wood',
        visual: 'ramp',
      },
    ],
    halfExtents: [12, 4, 4],
    supports: [],
  },
  stairs: {
    kind: 'stairs',
    label: 'Stairs',
    blurb: 'Three steps down towards +X. Dominoes on the treads topple down them.',
    parts: [
      {
        name: 'steps',
        body: 'fixed',
        offset: [0, 0, 0],
        colliders: [box([3, 3, 4], [-6, 3, 0]), box([3, 2, 4], [0, 2, 0]), box([3, 1, 4], [6, 1, 0])],
        friction: 0.6,
        material: 'woodDark',
        visual: 'stairs',
      },
    ],
    halfExtents: [9, 3, 4],
    supports: [
      { cx: -6, cz: 0, hx: 3, hz: 4, y: 6 },
      { cx: 0, cz: 0, hx: 3, hz: 4, y: 4 },
      { cx: 6, cz: 0, hx: 3, hz: 4, y: 2 },
    ],
  },
  lever: {
    kind: 'lever',
    label: 'Lever',
    blurb: 'A seesaw: push one end down and the other end flips up.',
    parts: [
      {
        name: 'fulcrum',
        body: 'fixed',
        offset: [0, 1.5, 0],
        colliders: [box([1, 1.5, 3])],
        friction: 0.6,
        material: 'metal',
        visual: 'fulcrum',
      },
      {
        name: 'plank',
        body: 'dynamic',
        offset: [0, 3.5, 0],
        colliders: [box([14, 0.5, 3], undefined, 0.1)],
        density: 0.5,
        friction: 0.6,
        restitution: 0.05,
        material: 'wood',
        visual: 'plank',
        joint: { to: 'fulcrum', anchorSelf: [0, -0.5, 0], anchorOther: [0, 1.5, 0], axis: [0, 0, 1] },
      },
    ],
    halfExtents: [14, 2, 3],
    supports: [{ cx: 0, cz: 0, hx: 14, hz: 3, y: 4 }],
  },
  marble: {
    kind: 'marble',
    label: 'Marble',
    blurb: 'A heavy glass marble. Rolls down ramps and flies off levers and springs.',
    parts: [
      {
        name: 'ball',
        body: 'dynamic',
        offset: [0, 1.5, 0],
        colliders: [{ shape: { type: 'ball', radius: 1.5 } }],
        density: 2.5,
        friction: 0.3,
        restitution: 0.3,
        material: 'marble',
        visual: 'marble',
        ccd: true,
      },
    ],
    halfExtents: [1.5, 1.5, 1.5],
    supports: [],
  },
  bridge: {
    kind: 'bridge',
    label: 'Bridge',
    blurb: 'A long plank. Rests on the highest thing under it, so it can span a gap.',
    parts: [
      {
        name: 'deck',
        body: 'fixed',
        offset: [0, 0.5, 0],
        colliders: [box([15, 0.5, 3])],
        friction: 0.6,
        material: 'wood',
        visual: 'bridge',
      },
    ],
    halfExtents: [15, 0.5, 3],
    supports: [{ cx: 0, cz: 0, hx: 15, hz: 3, y: 1 }],
  },
  spring: {
    kind: 'spring',
    label: 'Spring pad',
    blurb: 'Launches anything that lands on it up and towards +X.',
    parts: [
      {
        name: 'pad',
        body: 'fixed',
        offset: [0, 0.5, 0],
        colliders: [box([3, 0.5, 3])],
        friction: 0.6,
        material: 'spring',
        visual: 'spring',
      },
      {
        name: 'trigger',
        body: 'fixed',
        offset: [0, 2, 0],
        colliders: [box([2.8, 1, 2.8])],
        material: 'spring',
        sensor: 'spring',
        launchVelocity: [120, 220, 0],
      },
    ],
    halfExtents: [3, 0.5, 3],
    supports: [{ cx: 0, cz: 0, hx: 3, hz: 3, y: 1 }],
  },

  // ---- fixtures ------------------------------------------------------------------------------

  pendulum: {
    kind: 'pendulum',
    label: 'Pendulum',
    blurb: 'Starts the run: a heavy hammer swings through the origin towards +X.',
    parts: [
      {
        name: 'frame',
        body: 'fixed',
        offset: [0, 12, 0],
        // Two posts at z = ±5 and a crossbar at the pivot height (y = 24).
        colliders: [box([0.6, 12, 0.6], [0, 0, -5]), box([0.6, 12, 0.6], [0, 0, 5]), box([0.6, 0.6, 5.6], [0, 12, 0])],
        friction: 0.5,
        material: 'metal',
        visual: 'pendulumFrame',
      },
      {
        name: 'arm',
        body: 'dynamic',
        // Part centre is the pivot. Hanging straight down the head spans y 3..7 at x = 0.
        offset: [0, 24, 0],
        rotation: PENDULUM_START,
        colliders: [box([0.4, 8.5, 0.4], [0, -9.5, 0]), box([1.5, 2, 2.5], [0, -19, 0], 0.2)],
        density: 3,
        friction: 0.4,
        restitution: 0.05,
        material: 'brass',
        visual: 'pendulumArm',
        joint: { to: 'frame', anchorSelf: [0, 0, 0], anchorOther: [0, 12, 0], axis: [0, 0, 1] },
      },
    ],
    halfExtents: [2, 12.5, 6],
    supports: [],
  },
  car: {
    kind: 'car',
    label: 'Toy car',
    blurb: 'Starts the run: rolls forward along +X.',
    parts: [
      {
        name: 'body',
        body: 'dynamic',
        offset: [0, 1.5, 0],
        colliders: [box([4, 1.5, 2.5], undefined, 0.5)],
        density: 0.8,
        friction: 0.02,
        restitution: 0.1,
        material: 'plastic',
        visual: 'car',
        launchVelocity: [70, 0, 0],
      },
    ],
    halfExtents: [4, 1.5, 2.5],
    supports: [],
  },
  marbleRamp: {
    kind: 'marbleRamp',
    label: 'Marble chute',
    blurb: 'Starts the run: a marble rolls down the chute and flies off the low end at +X.',
    parts: [
      {
        name: 'chute',
        body: 'fixed',
        offset: [0, 0, 0],
        colliders: [
          {
            shape: {
              type: 'hull',
              points: [
                [-15, 0, -4],
                [15, 0, -4],
                [-15, 14, -4],
                [15, 4, -4],
                [-15, 0, 4],
                [15, 0, 4],
                [-15, 14, 4],
                [15, 4, 4],
              ],
            },
          },
          { shape: { type: 'box', half: [15.8, 1, 0.4] }, offset: [0.3, 10, -4.4], rotation: CHUTE_TILT },
          { shape: { type: 'box', half: [15.8, 1, 0.4] }, offset: [0.3, 10, 4.4], rotation: CHUTE_TILT },
          box([0.5, 1.5, 4], [-15.5, 15, 0]),
        ],
        friction: 0.5,
        material: 'wood',
        visual: 'chute',
      },
      {
        name: 'marble',
        body: 'dynamic',
        offset: [-11.5, 14.45, 0],
        colliders: [{ shape: { type: 'ball', radius: 1.5 } }],
        density: 2.5,
        friction: 0.3,
        restitution: 0.3,
        material: 'marble',
        visual: 'marble',
        ccd: true,
      },
    ],
    halfExtents: [16, 8, 5],
    supports: [],
  },
  bell: {
    kind: 'bell',
    label: 'Bell',
    blurb: 'The goal: touch it with anything to ring it.',
    parts: [
      {
        name: 'bell',
        body: 'fixed',
        offset: [0, 5.5, 0],
        colliders: [{ shape: { type: 'cylinder', halfHeight: 3.5, radius: 3 } }],
        friction: 0.4,
        material: 'brass',
        visual: 'bell',
      },
      {
        name: 'sensor',
        body: 'fixed',
        offset: [0, 5.5, 0],
        colliders: [{ shape: { type: 'cylinder', halfHeight: 4.5, radius: 4 } }],
        material: 'goal',
        sensor: 'goal',
      },
    ],
    halfExtents: [4, 5, 4],
    supports: [],
  },
  flag: {
    kind: 'flag',
    label: 'Flag',
    blurb: 'The goal: knock the flag over.',
    parts: [
      {
        name: 'flag',
        body: 'dynamic',
        offset: [0, 0.4, 0],
        colliders: [
          { shape: { type: 'cylinder', halfHeight: 0.4, radius: 2 } },
          box([0.3, 7, 0.3], [0, 7.4, 0]),
        ],
        density: 0.3,
        friction: 0.5,
        restitution: 0.05,
        material: 'goal',
        visual: 'flag',
        goalOnTopple: true,
      },
    ],
    halfExtents: [2, 8, 2],
    supports: [],
  },
  cup: {
    kind: 'cup',
    label: 'Cup',
    blurb: 'The goal: drop something into the cup.',
    parts: [
      {
        name: 'cup',
        body: 'fixed',
        offset: [0, 0, 0],
        colliders: [
          box([5, 0.25, 5], [0, 0.25, 0]),
          box([0.4, 2, 5], [-4.6, 2, 0]),
          box([0.4, 2, 5], [4.6, 2, 0]),
          box([5, 2, 0.4], [0, 2, -4.6]),
          box([5, 2, 0.4], [0, 2, 4.6]),
        ],
        friction: 0.5,
        material: 'goal',
        visual: 'cup',
      },
      {
        name: 'sensor',
        body: 'fixed',
        offset: [0, 2.25, 0],
        colliders: [box([4, 1.75, 4])],
        material: 'goal',
        sensor: 'goal',
      },
    ],
    halfExtents: [5, 2, 5],
    supports: [],
  },
  star: {
    kind: 'star',
    label: 'Star token',
    blurb: 'Bonus: knock the star over in the same run for an extra star.',
    parts: [
      {
        name: 'coin',
        body: 'dynamic',
        offset: [0, 2.2, 0],
        // A coin standing on its edge, face towards ±X.
        rotation: Z90,
        colliders: [{ shape: { type: 'cylinder', halfHeight: 0.3, radius: 2.2 } }],
        density: 1,
        friction: 0.5,
        restitution: 0.1,
        material: 'star',
        visual: 'star',
        starOnTopple: true,
      },
    ],
    halfExtents: [0.3, 2.2, 2.2],
    supports: [],
  },
  block: {
    kind: 'block',
    label: 'Block',
    blurb: 'A solid obstacle.',
    parts: [
      {
        name: 'block',
        body: 'fixed',
        offset: [0, 3, 0],
        colliders: [box([5, 3, 2], undefined, 0.3)],
        friction: 0.6,
        material: 'woodDark',
        visual: 'block',
      },
    ],
    halfExtents: [5, 3, 2],
    supports: [{ cx: 0, cz: 0, hx: 5, hz: 2, y: 6 }],
  },
  platform: {
    kind: 'platform',
    label: 'Platform',
    blurb: 'A raised deck you can build on.',
    parts: [
      {
        name: 'deck',
        body: 'fixed',
        offset: [0, 5, 0],
        colliders: [box([15, 5, 10], undefined, 0.3)],
        friction: 0.6,
        material: 'wood',
        visual: 'platform',
      },
    ],
    halfExtents: [15, 5, 10],
    supports: [{ cx: 0, cz: 0, hx: 15, hz: 10, y: 10 }],
  },
}

/** Tray order. */
export const PLACEABLE_KINDS: PlaceableKind[] = [
  'domino',
  'tallDomino',
  'ramp',
  'stairs',
  'lever',
  'marble',
  'bridge',
  'spring',
]

export function isPlaceable(kind: PieceKind): kind is PlaceableKind {
  return (PLACEABLE_KINDS as string[]).includes(kind)
}

// ---------------------------------------------------------------------------------------------
// World-space helpers

/** World footprint of a piece's bounding box on the XZ plane. */
export function pieceFootprint(piece: Pick<PlacedPiece, 'kind' | 'x' | 'z' | 'rotY'>): Footprint {
  const [hx, , hz] = PIECES[piece.kind].halfExtents
  return { cx: piece.x, cz: piece.z, hx, hz, rotY: piece.rotY }
}

/** World vertical extent [bottom, top] of a piece's bounding box. */
export function pieceHeightRange(piece: Pick<PlacedPiece, 'kind' | 'y'>): [number, number] {
  return [piece.y, piece.y + 2 * PIECES[piece.kind].halfExtents[1]]
}

/** Flat top surfaces a piece offers, in world space. */
export function pieceSupports(piece: PlacedPiece): SupportTop[] {
  return PIECES[piece.kind].supports.map((s) => {
    const [ox, oz] = rotateXZ(s.cx, s.cz, piece.rotY)
    return {
      footprint: { cx: piece.x + ox, cz: piece.z + oz, hx: s.hx, hz: s.hz, rotY: piece.rotY },
      y: piece.y + s.y,
    }
  })
}

/** World pose of one part's centre, before any simulation. */
export function partWorldPose(piece: PlacedPiece, part: PartDef): { position: Vec3; rotation: Quat } {
  const qy = quatFromRotY(piece.rotY)
  const o = rotateVec(qy, part.offset)
  return {
    position: [piece.x + o[0], piece.y + o[1], piece.z + o[2]],
    rotation: quatMultiply(qy, part.rotation ?? IDENTITY_QUAT),
  }
}
