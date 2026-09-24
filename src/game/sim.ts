/*
 * Headless-capable Rapier physics simulation for one run of a level. Builds a deterministic
 * physics world from a level's fixtures plus the player's placed pieces, steps it at a fixed
 * timestep, and reports impacts, the goal, the star token and the run outcome. The three.js
 * scene reads `Simulation.transforms` every frame; it never touches Rapier directly.
 */

import RAPIER from '@dimforge/rapier3d-compat'

import type {
  ImpactEvent,
  LevelDef,
  MaterialKey,
  PartShape,
  PieceKind,
  PlacedPiece,
  Quat,
  RunOutcome,
  RunResult,
  StepEvents,
  Vec3,
} from './types.ts'
import { PIECES, partWorldPose, quatFromRotY, rotateVec } from './pieces.ts'

export const FIXED_DT = 1 / 120
/** Seconds; a run that has not decided by this time is a hard fail. */
export const MAX_RUN_TIME = 40
/** Seconds of continuous stillness before an undecided run is declared a fail. */
export const SETTLE_TIME = 1.0
/** Seconds simulated after the goal is reached before the outcome 'success' is final. */
export const SUCCESS_TAIL = 1.5

const TOPPLE_ANGLE = (45 * Math.PI) / 180
const ZERO_VEC = { x: 0, y: 0, z: 0 }

/** Harder / louder materials sound first when two bodies of different materials collide. */
const MATERIAL_PRIORITY: MaterialKey[] = [
  'marble',
  'metal',
  'brass',
  'star',
  'plastic',
  'dominoTall',
  'domino',
  'woodDark',
  'wood',
  'cloth',
  'rubber',
  'spring',
  'goal',
]

let initPromise: Promise<void> | null = null
let ready = false

/** Loads the Rapier wasm module. Idempotent: safe to call from multiple places. */
export function initPhysics(): Promise<void> {
  if (!initPromise) {
    initPromise = RAPIER.init().then(() => {
      ready = true
    })
  }
  return initPromise
}

export function physicsReady(): boolean {
  return ready
}

export interface SimBody {
  pieceId: string
  kind: PieceKind
  partIndex: number
  material: MaterialKey
}

export interface SimLevel {
  table: LevelDef['table']
  fixtures: PlacedPiece[]
}

interface ColliderInfo {
  collider: RAPIER.Collider
  /** Index into `dynamicRecords` / `bodies`, or -1 for a fixed (or body-less) collider. */
  bodyIndex: number
  material: MaterialKey
  pieceId: string
}

interface SpringInfo {
  rotY: number
  launchVelocity: Vec3
  /** Piece origin + 1 cm up, reported when the spring fires (for effects/audio). */
  originUp: Vec3
}

interface DynamicRecord {
  body: RAPIER.RigidBody
  initialRotation: Quat
  initialPosition: Vec3
  goalOnTopple: boolean
  starOnTopple: boolean
  /** Hinged to its own piece, so it can swing in place forever without carrying the chain. */
  jointed: boolean
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function vecLength(v: { x: number; y: number; z: number }): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
}

function speedBetween(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return vecLength({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
}

function midpoint(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): Vec3 {
  return [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2]
}

function harderMaterial(a: MaterialKey, b: MaterialKey): MaterialKey {
  const ia = MATERIAL_PRIORITY.indexOf(a)
  const ib = MATERIAL_PRIORITY.indexOf(b)
  return ia <= ib ? a : b
}

/** Angle in radians between a body's current rotation and its rotation at construction. */
function angleFromInitial(q0: Quat, r: { x: number; y: number; z: number; w: number }): number {
  const dot = q0[0] * r.x + q0[1] * r.y + q0[2] * r.z + q0[3] * r.w
  return 2 * Math.acos(clamp(Math.abs(dot), -1, 1))
}

function buildColliderDesc(shape: PartShape, pieceKind: PieceKind): RAPIER.ColliderDesc {
  switch (shape.type) {
    case 'box': {
      const [hx, hy, hz] = shape.half
      const r = shape.radius ?? 0
      return r > 0
        ? RAPIER.ColliderDesc.roundCuboid(hx - r, hy - r, hz - r, r)
        : RAPIER.ColliderDesc.cuboid(hx, hy, hz)
    }
    case 'ball':
      return RAPIER.ColliderDesc.ball(shape.radius)
    case 'cylinder':
      return RAPIER.ColliderDesc.cylinder(shape.halfHeight, shape.radius)
    case 'hull': {
      const points = new Float32Array(shape.points.length * 3)
      shape.points.forEach((p, i) => {
        points[i * 3] = p[0]
        points[i * 3 + 1] = p[1]
        points[i * 3 + 2] = p[2]
      })
      const desc = RAPIER.ColliderDesc.convexHull(points)
      if (!desc) throw new Error(`sim: convex hull failed for piece kind "${pieceKind}"`)
      return desc
    }
  }
}

export class Simulation {
  /** Dynamic parts only, in creation order (fixtures first, then placed; part order within a piece). */
  readonly bodies: SimBody[] = []
  /** 7 floats per entry of `bodies`: px,py,pz,qx,qy,qz,qw. Refreshed after every step and after construction. */
  readonly transforms: Float32Array
  /** Simulated seconds. */
  time = 0
  outcome: RunOutcome = 'running'
  goalReached = false
  starCollected = false
  /** World position of the goal piece's origin + 6 cm up. */
  goalPosition: Vec3 = [0, 0, 0]
  starPosition: Vec3 | null = null
  /** Simulated time the goal was first reached, or null. Used by `runToEnd` for the success time. */
  goalTime: number | null = null

  private readonly world: RAPIER.World
  private readonly eventQueue: RAPIER.EventQueue
  private readonly colliderInfo = new Map<number, ColliderInfo>()
  private readonly dynamicRecords: DynamicRecord[] = []
  private readonly goalSensors: RAPIER.Collider[] = []
  private readonly springSensors: { collider: RAPIER.Collider; info: SpringInfo }[] = []
  private readonly lastOnsetTime = new Map<string, number>()
  private readonly springLastLaunch = new Map<string, number>()
  private stillSince: number | null = null
  private goalFound = false
  private starFound = false
  private disposed = false

  constructor(level: SimLevel, placed: PlacedPiece[]) {
    if (!physicsReady()) {
      throw new Error('Simulation: initPhysics() has not resolved yet')
    }

    this.world = new RAPIER.World({ x: 0, y: -981, z: 0 })
    this.world.timestep = FIXED_DT
    this.world.lengthUnit = 100
    this.world.integrationParameters.numSolverIterations = 8
    this.eventQueue = new RAPIER.EventQueue(true)

    const tableDesc = RAPIER.ColliderDesc.cuboid(level.table.width / 2, 2, level.table.depth / 2)
      .setTranslation(0, -2, 0)
      .setFriction(0.5)
    const tableCollider = this.world.createCollider(tableDesc)
    this.colliderInfo.set(tableCollider.handle, {
      collider: tableCollider,
      bodyIndex: -1,
      material: 'wood',
      pieceId: 'table',
    })

    for (const piece of level.fixtures) this.addPiece(piece)
    for (const piece of placed) this.addPiece(piece)

    this.transforms = new Float32Array(this.bodies.length * 7)
    this.refreshTransforms()
  }

  private addPiece(piece: PlacedPiece): void {
    const def = PIECES[piece.kind]
    const partBodies = new Map<string, RAPIER.RigidBody>()

    for (let partIndex = 0; partIndex < def.parts.length; partIndex++) {
      const part = def.parts[partIndex]
      const pose = partWorldPose(piece, part)
      const isDynamic = part.body === 'dynamic'

      const bodyDesc = (isDynamic ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.fixed())
        .setTranslation(pose.position[0], pose.position[1], pose.position[2])
        .setRotation({ x: pose.rotation[0], y: pose.rotation[1], z: pose.rotation[2], w: pose.rotation[3] })
      if (isDynamic) {
        // Hinged parts (the pendulum arm, the lever plank) get a little extra damping so they
        // settle eventually; the stillness check ignores them, so a swinging pendulum on its own
        // cannot keep a failed run alive.
        const angularDamping = part.material === 'marble' ? 0.4 : part.joint ? 0.3 : 0.2
        bodyDesc.setLinearDamping(0.05).setAngularDamping(angularDamping).setCcdEnabled(part.ccd === true)
      }
      const body = this.world.createRigidBody(bodyDesc)
      partBodies.set(part.name, body)

      if (isDynamic && part.launchVelocity) {
        const v = rotateVec(quatFromRotY(piece.rotY), part.launchVelocity)
        body.setLinvel({ x: v[0], y: v[1], z: v[2] }, true)
      }

      const bodyIndex = isDynamic ? this.bodies.length : -1

      for (const c of part.colliders) {
        const colliderDesc = buildColliderDesc(c.shape, piece.kind)
        if (c.offset) colliderDesc.setTranslation(c.offset[0], c.offset[1], c.offset[2])
        if (c.rotation) {
          colliderDesc.setRotation({ x: c.rotation[0], y: c.rotation[1], z: c.rotation[2], w: c.rotation[3] })
        }
        if (isDynamic) colliderDesc.setDensity(part.density ?? 1)
        colliderDesc.setFriction(part.friction ?? 0.5)
        colliderDesc.setRestitution(part.restitution ?? 0)
        if (part.sensor) {
          colliderDesc.setSensor(true)
        } else {
          colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
        }

        const collider = this.world.createCollider(colliderDesc, body)
        this.colliderInfo.set(collider.handle, { collider, bodyIndex, material: part.material, pieceId: piece.id })
        if (part.sensor === 'goal') this.goalSensors.push(collider)
        if (part.sensor === 'spring') {
          this.springSensors.push({
            collider,
            info: {
              rotY: piece.rotY,
              launchVelocity: part.launchVelocity ?? [0, 0, 0],
              originUp: [piece.x, piece.y + 1, piece.z],
            },
          })
        }
      }

      if (part.joint) {
        const otherBody = partBodies.get(part.joint.to)
        if (!otherBody) {
          throw new Error(
            `sim: joint target "${part.joint.to}" not yet created for part "${part.name}" in piece "${piece.kind}"`,
          )
        }
        const jointData = RAPIER.JointData.revolute(
          { x: part.joint.anchorSelf[0], y: part.joint.anchorSelf[1], z: part.joint.anchorSelf[2] },
          { x: part.joint.anchorOther[0], y: part.joint.anchorOther[1], z: part.joint.anchorOther[2] },
          { x: part.joint.axis[0], y: part.joint.axis[1], z: part.joint.axis[2] },
        )
        const joint = this.world.createImpulseJoint(jointData, body, otherBody, true)
        joint.setContactsEnabled(false)
      }

      if (!this.goalFound && (part.sensor === 'goal' || part.goalOnTopple === true)) {
        this.goalPosition = [piece.x, piece.y + 6, piece.z]
        this.goalFound = true
      }
      if (!this.starFound && part.starOnTopple === true) {
        this.starPosition = [piece.x, piece.y, piece.z]
        this.starFound = true
      }

      if (isDynamic) {
        this.bodies.push({ pieceId: piece.id, kind: piece.kind, partIndex, material: part.material })
        this.dynamicRecords.push({
          body,
          initialRotation: pose.rotation,
          initialPosition: pose.position,
          goalOnTopple: part.goalOnTopple === true,
          starOnTopple: part.starOnTopple === true,
          jointed: part.joint !== undefined,
        })
      }
    }
  }

  private refreshTransforms(): void {
    for (let i = 0; i < this.dynamicRecords.length; i++) {
      const body = this.dynamicRecords[i].body
      const p = body.translation()
      const q = body.rotation()
      const o = i * 7
      this.transforms[o] = p.x
      this.transforms[o + 1] = p.y
      this.transforms[o + 2] = p.z
      this.transforms[o + 3] = q.x
      this.transforms[o + 4] = q.y
      this.transforms[o + 5] = q.z
      this.transforms[o + 6] = q.w
    }
  }

  private processCollisions(newTime: number): ImpactEvent[] {
    const candidates: ImpactEvent[] = []
    this.eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return
      const info1 = this.colliderInfo.get(h1)
      const info2 = this.colliderInfo.get(h2)
      if (!info1 || !info2) return
      if (info1.bodyIndex < 0 && info2.bodyIndex < 0) return

      const vel1 = info1.bodyIndex >= 0 ? this.dynamicRecords[info1.bodyIndex].body.linvel() : ZERO_VEC
      const vel2 = info2.bodyIndex >= 0 ? this.dynamicRecords[info2.bodyIndex].body.linvel() : ZERO_VEC
      const strength = clamp(speedBetween(vel1, vel2) / 150, 0, 1)
      if (strength < 0.04) return

      const key = h1 < h2 ? `${h1}:${h2}` : `${h2}:${h1}`
      const last = this.lastOnsetTime.get(key)
      if (last !== undefined && newTime - last < 0.06) return
      this.lastOnsetTime.set(key, newTime)

      const material =
        info1.bodyIndex >= 0 && info2.bodyIndex >= 0
          ? harderMaterial(info1.material, info2.material)
          : info1.bodyIndex >= 0
            ? info1.material
            : info2.material

      candidates.push({
        strength,
        position: midpoint(info1.collider.translation(), info2.collider.translation()),
        material,
      })
    })
    candidates.sort((a, b) => b.strength - a.strength)
    return candidates.slice(0, 12)
  }

  step(): StepEvents {
    const newTime = this.time + FIXED_DT
    this.world.step(this.eventQueue)

    const impacts = this.processCollisions(newTime)
    let goalReachedThisStep = false
    let starCollectedThisStep = false

    if (this.outcome === 'running') {
      if (!this.goalReached) {
        for (const sensor of this.goalSensors) {
          this.world.intersectionPairsWith(sensor, (other) => {
            if (this.goalReached) return
            const info = this.colliderInfo.get(other.handle)
            if (info && info.bodyIndex >= 0) this.goalReached = true
          })
          if (this.goalReached) break
        }
      }
      if (!this.goalReached) {
        for (const rec of this.dynamicRecords) {
          if (!rec.goalOnTopple) continue
          if (angleFromInitial(rec.initialRotation, rec.body.rotation()) > TOPPLE_ANGLE) {
            this.goalReached = true
            break
          }
        }
      }
      if (this.goalReached && this.goalTime === null) {
        this.goalTime = newTime
        goalReachedThisStep = true
      }

      if (!this.starCollected) {
        for (const rec of this.dynamicRecords) {
          if (!rec.starOnTopple) continue
          const angle = angleFromInitial(rec.initialRotation, rec.body.rotation())
          const pos = rec.body.translation()
          const dx = pos.x - rec.initialPosition[0]
          const dz = pos.z - rec.initialPosition[2]
          if (angle > TOPPLE_ANGLE || Math.sqrt(dx * dx + dz * dz) > 3) {
            this.starCollected = true
            starCollectedThisStep = true
            break
          }
        }
      }
    }

    const springs: Vec3[] = []
    for (const spring of this.springSensors) {
      this.world.intersectionPairsWith(spring.collider, (other) => {
        const info = this.colliderInfo.get(other.handle)
        if (!info || info.bodyIndex < 0) return
        const rec = this.dynamicRecords[info.bodyIndex]
        if (vecLength(rec.body.linvel()) <= 15) return
        const key = `${spring.collider.handle}:${info.bodyIndex}`
        const last = this.springLastLaunch.get(key)
        if (last !== undefined && newTime - last < 0.6) return
        this.springLastLaunch.set(key, newTime)
        const v = rotateVec(quatFromRotY(spring.info.rotY), spring.info.launchVelocity)
        rec.body.setLinvel({ x: v[0], y: v[1], z: v[2] }, true)
        springs.push(spring.info.originUp)
      })
    }

    for (const rec of this.dynamicRecords) {
      if (rec.body.isEnabled() && rec.body.translation().y < -30) rec.body.setEnabled(false)
    }

    if (this.outcome === 'running') {
      if (this.goalReached) {
        if (newTime >= (this.goalTime as number) + SUCCESS_TAIL) this.outcome = 'success'
      } else {
        let allStill = true
        for (const rec of this.dynamicRecords) {
          if (rec.jointed || !rec.body.isEnabled() || rec.body.isSleeping()) continue
          if (vecLength(rec.body.linvel()) >= 1 || vecLength(rec.body.angvel()) >= 0.1) {
            allStill = false
            break
          }
        }
        if (allStill) {
          if (this.stillSince === null) this.stillSince = newTime
          if (newTime >= 0.5 && newTime - this.stillSince >= SETTLE_TIME) this.outcome = 'fail'
        } else {
          this.stillSince = null
        }
        if (this.outcome === 'running' && newTime >= MAX_RUN_TIME) this.outcome = 'fail'
      }
    }

    this.refreshTransforms()
    this.time = newTime

    return { impacts, goalReached: goalReachedThisStep, starCollected: starCollectedThisStep, springs }
  }

  /** Speed-weighted centroid of bodies moving faster than 5 cm/s; null if none are. */
  activityFocus(): Vec3 | null {
    let sx = 0
    let sy = 0
    let sz = 0
    let weight = 0
    for (const rec of this.dynamicRecords) {
      if (!rec.body.isEnabled()) continue
      const speed = vecLength(rec.body.linvel())
      if (speed <= 5) continue
      const p = rec.body.translation()
      sx += p.x * speed
      sy += p.y * speed
      sz += p.z * speed
      weight += speed
    }
    return weight === 0 ? null : [sx / weight, sy / weight, sz / weight]
  }

  /** Frees the Rapier world. Safe to call more than once. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.world.free()
  }
}

/** Runs a level to completion headlessly and returns the outcome. Requires `initPhysics()` to have resolved. */
export function runToEnd(level: SimLevel, placed: PlacedPiece[], maxTime = MAX_RUN_TIME): RunResult {
  const sim = new Simulation(level, placed)
  try {
    while (sim.outcome === 'running' && sim.time < maxTime) sim.step()
    const outcome: 'success' | 'fail' = sim.outcome === 'success' ? 'success' : 'fail'
    const time = outcome === 'success' && sim.goalTime !== null ? sim.goalTime : sim.time
    return { outcome, starCollected: sim.starCollected, time }
  } finally {
    sim.dispose()
  }
}
