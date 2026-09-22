// Deterministic 2D projectile physics for the basketball interaction. Pure
// math only — no Math.random anywhere in this file, no DOM, no timers. The
// same launch point + drag delta + config always produces the exact same
// trajectory and the exact same outcome classification. Randomness (which
// line of dialogue plays) lives entirely in logic/responsePool.ts, a
// deliberately separate concern from physics.
//
// Coordinate space: everything here is in "stage percent" — 0..100 across
// the interactive area's own width/height, independent of actual pixel size
// or screen resolution. The caller (useCoreInteraction) converts to/from
// real pixels using the stage element's own bounding box; this module never
// needs to know how big the screen is.
import type { ShotOutcome, Vec2 } from './interactionState.ts'

export interface ShotConfig {
  launch: Vec2 // where the Core rests, and where every shot starts from
  rim: Vec2 // the hoop's target point
  gravity: number // %/s^2, downward (y increases downward, screen convention)
  powerScale: number // drag % -> launch speed %/s
  maxSpeed: number // speed cap, %/s, so a huge drag can't break the physics
  rimRadius: number // "made" tolerance around the rim, in %
  closeMargin: number // CLOSE = within rimRadius + closeMargin
  missMargin: number // MISS = within rimRadius + closeMargin + missMargin; beyond is VERY_BAD_MISS
  floorY: number // % — flight is considered over once it reaches this depth
}

// Tuned so a confident, roughly-correct drag (pulling down-and-away from the
// rim by a moderate amount) scores, and the failure tiers are each reachable
// by a plausible, distinguishable drag — verified by the accompanying tests,
// not just eyeballed.
export const DEFAULT_SHOT_CONFIG: ShotConfig = {
  launch: { x: 50, y: 58 },
  rim: { x: 78, y: 30 },
  gravity: 140,
  powerScale: 4.2,
  maxSpeed: 220,
  rimRadius: 7,
  closeMargin: 7,
  missMargin: 16,
  floorY: 100,
}

export interface TrajectorySample {
  t: number // seconds since release
  x: number
  y: number
}

function launchVelocity(dragDelta: Vec2, config: ShotConfig): Vec2 {
  // Slingshot convention: pulling the Core away from the rim and releasing
  // sends it the OPPOSITE way — the same gesture a catapult or Angry-Birds-
  // style aim uses, and the only one that keeps the aim point visible under
  // a finger on touch instead of hidden beneath it.
  const vx = -dragDelta.x * config.powerScale
  const vy = -dragDelta.y * config.powerScale
  const speed = Math.hypot(vx, vy)
  if (speed <= config.maxSpeed || speed === 0) return { x: vx, y: vy }
  const scale = config.maxSpeed / speed
  return { x: vx * scale, y: vy * scale }
}

// Time at which the flight reaches `floorY` (or leaves generous stage
// bounds), used as the upper bound for sampling. Falls back to a short fixed
// window if the shot never comes down within it (e.g. near-zero gravity).
function flightDuration(v0: Vec2, config: ShotConfig): number {
  const { gravity, launch, floorY } = config
  if (gravity <= 0) return 1.2
  // launch.y + v0.y*t + 0.5*g*t^2 = floorY
  const a = 0.5 * gravity
  const b = v0.y
  const c = launch.y - floorY
  const disc = b * b - 4 * a * c
  if (disc < 0) return 1.2
  const root = (-b + Math.sqrt(disc)) / (2 * a)
  return root > 0 ? root : 1.2
}

// The full flight, sampled at a fixed count — deterministic and independent
// of frame rate or wall-clock time; the caller decides how to map these
// samples onto an actual animation duration.
export function computeTrajectory(dragDelta: Vec2, config: ShotConfig = DEFAULT_SHOT_CONFIG, sampleCount = 48): TrajectorySample[] {
  const v0 = launchVelocity(dragDelta, config)
  const duration = flightDuration(v0, config)
  const samples: TrajectorySample[] = []
  for (let i = 0; i <= sampleCount; i++) {
    const t = (duration * i) / sampleCount
    samples.push({
      t,
      x: config.launch.x + v0.x * t,
      y: config.launch.y + v0.y * t + 0.5 * config.gravity * t * t,
    })
  }
  return samples
}

export interface ShotResult {
  outcome: ShotOutcome
  closestApproach: number // % distance from the rim at the nearest descending point
  apexY: number // the highest point reached (smallest y), for "did it even get there"
  trajectory: TrajectorySample[]
}

// Classifies a shot from the same inputs computeTrajectory uses, so the
// preview shown while aiming and the result after release are always
// consistent with each other.
export function classifyShot(dragDelta: Vec2, config: ShotConfig = DEFAULT_SHOT_CONFIG): ShotResult {
  const v0 = launchVelocity(dragDelta, config)
  const trajectory = computeTrajectory(dragDelta, config)

  let apexY = config.launch.y
  for (const s of trajectory) if (s.y < apexY) apexY = s.y

  // Only the descending half of the arc counts as "coming down into the
  // hoop" — a real shot that merely passes near the rim on its way UP
  // doesn't go in. tApex is when vertical velocity crosses zero; if the
  // shot starts at or past its peak already (a weak/flat drag), the whole
  // flight counts as descending.
  const tApex = config.gravity > 0 ? Math.max(0, -v0.y / config.gravity) : 0
  let closestApproach = Infinity
  for (const s of trajectory) {
    if (s.t < tApex) continue
    const d = Math.hypot(s.x - config.rim.x, s.y - config.rim.y)
    if (d < closestApproach) closestApproach = d
  }
  if (!Number.isFinite(closestApproach)) closestApproach = Math.hypot(config.launch.x - config.rim.x, config.launch.y - config.rim.y)

  // A shot that never even reaches rim height is a clear airball, whatever
  // its closest x/y distance happens to measure out to.
  const reachedRimHeight = apexY <= config.rim.y

  const madeBound = config.rimRadius
  const closeBound = config.rimRadius + config.closeMargin
  const missBound = config.rimRadius + config.closeMargin + config.missMargin

  let outcome: ShotOutcome
  if (!reachedRimHeight) outcome = 'very_bad_miss'
  else if (closestApproach <= madeBound) outcome = 'made'
  else if (closestApproach <= closeBound) outcome = 'close'
  else if (closestApproach <= missBound) outcome = 'miss'
  else outcome = 'very_bad_miss'

  return { outcome, closestApproach, apexY, trajectory }
}

// A single canonical drag used for the keyboard/no-pointer fallback (Part
// 7): always the same gesture, so the resulting shot is always the same —
// found by sweeping DEFAULT_SHOT_CONFIG's velocity space for its actual
// scoring optimum (see the physics tests), not guessed, so the fallback
// reliably scores rather than merely "feeling about right".
export const FALLBACK_SHOT_DRAG: Vec2 = { x: -6.19, y: 24.29 }
