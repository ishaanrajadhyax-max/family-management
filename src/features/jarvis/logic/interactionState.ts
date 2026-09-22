// The Core Interaction Engine's state model — completely separate from
// coreState.ts/coreStore.ts (the REAL Jarvis system state). Nothing in this
// file, or anything that consumes it, is allowed to know about or touch
// listening/thinking/speaking/error/attention. This is deliberate: tapping
// or throwing the Core must never be able to corrupt what the interface says
// Jarvis is actually doing.
//
// USER ACTION -> INTERACTION ENGINE -> PHYSICS/LOGIC -> OUTCOME -> CORE
// ANIMATION -> JARVIS RESPONSE. This file models the middle of that chain:
// the phases an interaction moves through, shared by every interaction type
// (tap today; drag/basketball today; future ones reuse the same phases).

export type InteractionPhase =
  | 'none' // nothing happening — the default, almost all the time
  | 'pressed' // pointer down, not yet resolved to tap or drag
  | 'tap-react' // a tap was recognised; playing its reaction
  | 'grabbed' // a drag just started (still within the tap-vs-drag threshold)
  | 'aiming' // dragging; a trajectory preview is live
  | 'shooting' // released; the flight animation is running
  | 'outcome' // flight finished; showing the result + response
  | 'returning' // animating back to rest before returning to 'none'

export type ShotOutcome = 'made' | 'close' | 'miss' | 'very_bad_miss'

export interface Vec2 {
  x: number
  y: number
}

// What one interaction currently looks like, for rendering. Every field
// besides `phase` is optional because different phases populate different
// ones — a tap never has a dragDelta, 'none' has neither.
export interface InteractionSnapshot {
  phase: InteractionPhase
  tapResponse?: string
  dragDelta?: Vec2 // normalized (% of the stage box), current or final
  shotOutcome?: ShotOutcome
  shotResponse?: string
}

export const IDLE_INTERACTION: InteractionSnapshot = { phase: 'none' }

// Phases in which the user is actively mid-gesture (pointer still down, or
// an animation the gesture triggered is still playing) — used to decide
// whether a NEW gesture may begin, and whether the system is "busy" for
// purposes unrelated to Jarvis itself (e.g. suppressing a duplicate click).
const BUSY_PHASES: ReadonlySet<InteractionPhase> = new Set(['pressed', 'tap-react', 'grabbed', 'aiming', 'shooting', 'outcome', 'returning'])

export function isInteractionBusy(phase: InteractionPhase): boolean {
  return BUSY_PHASES.has(phase)
}
