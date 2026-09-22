import { useEffect, useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useCoreGesture } from './useCoreGesture'
import type { Point } from './useCoreGesture'
import { useCoreState } from './useCoreState'
import { useReducedMotion } from './useMotionPreference'
import { getInteractionSnapshot, setInteractionSnapshot, resetInteraction } from '../logic/interactionStore.ts'
import { classifyShot, DEFAULT_SHOT_CONFIG, FALLBACK_SHOT_DRAG } from '../logic/basketballPhysics.ts'
import type { TrajectorySample } from '../logic/basketballPhysics.ts'
import { isInteractionBusy } from '../logic/interactionState.ts'
import type { Vec2 } from '../logic/interactionState.ts'
import { pickResponse } from '../logic/responsePool.ts'
import { TAP_RESPONSES, SHOT_RESPONSES } from '../logic/coreResponses.ts'
import { playSound } from '../uiSound'

// The orchestrator at the centre of the Core Interaction Engine:
//
//   USER ACTION (useCoreGesture: pointer/touch)
//     -> INTERACTION ENGINE (this hook: tap vs. drag, phase sequencing)
//     -> PHYSICS/LOGIC (basketballPhysics.ts — pure, deterministic)
//     -> OUTCOME (classifyShot)
//     -> CORE ANIMATION (this hook writes --ix/--iy/--tap onto the Core's own
//        element; CSS keyframes keyed off data-interaction do the rest)
//     -> JARVIS RESPONSE (coreResponses.ts, picked via responsePool.ts)
//
// This hook NEVER imports coreStore.ts's setter and never calls it — see the
// INVARIANT test in server/tests/coreInteraction.test.mjs. It only READS the
// real system state (useCoreState), to decide whether a NEW drag may begin;
// a tap is always allowed, and an in-flight interaction always finishes
// rather than being cancelled by a system-state change underneath it.
//
// Basketball drags are only startable while systemState is 'idle' or
// 'attention' — starting to throw the Core mid-listen/mid-speech would be
// visually confusing about what Jarvis is actually doing. A tap has no such
// restriction: it is instant and never obscures anything.
const DRAG_ALLOWED_STATES = new Set(['idle', 'attention'])

const TAP_DURATION_MS = 420
const OUTCOME_HOLD_MS = 1300
const RETURN_DURATION_MS = 380
const FLIGHT_DURATION_MS = 700

function outcomeSound(outcome: ReturnType<typeof classifyShot>['outcome']): 'coreScore' | 'coreRimHit' | 'coreMiss' {
  if (outcome === 'made') return 'coreScore'
  if (outcome === 'close') return 'coreRimHit'
  return 'coreMiss'
}

export function useCoreInteraction(rootRef: RefObject<HTMLElement | null>, interactive: boolean) {
  const { state: systemState } = useCoreState()
  const reduced = useReducedMotion()
  const systemStateRef = useRef(systemState)
  const reducedRef = useRef(reduced)
  useLayoutEffect(() => {
    systemStateRef.current = systemState
    reducedRef.current = reduced
  })

  const lastTapResponse = useRef<string | undefined>(undefined)
  const lastShotResponse = useRef<string | undefined>(undefined)
  const box = useRef<{ width: number; height: number } | null>(null)
  const dragAllowed = useRef(false)
  const rafId = useRef(0)
  const timeoutId = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function clearTimers() {
    cancelAnimationFrame(rafId.current)
    clearTimeout(timeoutId.current)
  }

  function setOffset(dxPx: number, dyPx: number) {
    const el = rootRef.current
    if (!el) return
    el.style.setProperty('--ix', `${dxPx}px`)
    el.style.setProperty('--iy', `${dyPx}px`)
  }

  function toPercent(dxPx: number, dyPx: number): Vec2 {
    const b = box.current
    if (!b || b.width === 0 || b.height === 0) return { x: 0, y: 0 }
    return { x: (dxPx / b.width) * 100, y: (dyPx / b.height) * 100 }
  }

  function toPixels(dPercent: Vec2): Point {
    const b = box.current
    if (!b) return { x: 0, y: 0 }
    return { x: (dPercent.x / 100) * b.width, y: (dPercent.y / 100) * b.height }
  }

  // Animates the Core from the launch point along a precomputed trajectory,
  // then calls onDone. Reduced motion: jump straight there, no animated
  // flight — the outcome still happens, just without the arc.
  function animateFlight(trajectory: TrajectorySample[], onDone: () => void) {
    const last = trajectory.at(-1)
    if (reducedRef.current || !last) {
      const dPercent = { x: last ? last.x - DEFAULT_SHOT_CONFIG.launch.x : 0, y: last ? last.y - DEFAULT_SHOT_CONFIG.launch.y : 0 }
      const px = toPixels(dPercent)
      setOffset(px.x, px.y)
      timeoutId.current = setTimeout(onDone, 0)
      return
    }
    const totalT = last.t
    const startedAt = performance.now()
    const tick = () => {
      const elapsed = performance.now() - startedAt
      const frac = Math.min(1, elapsed / FLIGHT_DURATION_MS)
      const physicsT = frac * totalT
      const index = Math.min(trajectory.length - 1, Math.floor((physicsT / totalT) * (trajectory.length - 1)))
      const sample = trajectory[index]
      const dPercent = { x: sample.x - DEFAULT_SHOT_CONFIG.launch.x, y: sample.y - DEFAULT_SHOT_CONFIG.launch.y }
      const px = toPixels(dPercent)
      setOffset(px.x, px.y)
      if (frac < 1) {
        rafId.current = requestAnimationFrame(tick)
      } else {
        onDone()
      }
    }
    rafId.current = requestAnimationFrame(tick)
  }

  function animateReturn(onDone: () => void) {
    if (reducedRef.current) {
      setOffset(0, 0)
      timeoutId.current = setTimeout(onDone, 0)
      return
    }
    const el = rootRef.current
    const from = { x: parseFloat(el?.style.getPropertyValue('--ix') || '0'), y: parseFloat(el?.style.getPropertyValue('--iy') || '0') }
    const startedAt = performance.now()
    const tick = () => {
      const frac = Math.min(1, (performance.now() - startedAt) / RETURN_DURATION_MS)
      const eased = 1 - (1 - frac) * (1 - frac) // ease-out
      setOffset(from.x * (1 - eased), from.y * (1 - eased))
      if (frac < 1) {
        rafId.current = requestAnimationFrame(tick)
      } else {
        setOffset(0, 0)
        onDone()
      }
    }
    rafId.current = requestAnimationFrame(tick)
  }

  // Shared by a real drag-release and the keyboard fallback (Part 7): given a
  // drag delta already in stage-percent space, runs the exact same
  // shoot -> animate -> outcome -> return sequence either way, so the
  // fallback isn't a second, parallel implementation of a shot.
  function runShot(dPercent: Vec2) {
    const shot = classifyShot(dPercent)
    playSound('coreRelease')
    setInteractionSnapshot({ phase: 'shooting', dragDelta: dPercent, shotOutcome: shot.outcome })

    clearTimers()
    animateFlight(shot.trajectory, () => {
      const response = pickResponse(SHOT_RESPONSES[shot.outcome], lastShotResponse.current)
      lastShotResponse.current = response
      playSound(outcomeSound(shot.outcome))
      setInteractionSnapshot({ phase: 'outcome', shotOutcome: shot.outcome, shotResponse: response })
      timeoutId.current = setTimeout(() => {
        setInteractionSnapshot({ phase: 'returning', shotOutcome: shot.outcome })
        animateReturn(() => resetInteraction())
      }, reducedRef.current ? 0 : OUTCOME_HOLD_MS)
    })
  }

  // The non-drag alternative (Part 7): focus the Core, press Space/Enter,
  // and it takes the same canonical shot every time — always a made shot,
  // so the keyboard path is a genuine equivalent, not a lesser one. Ignored
  // while another interaction is already in flight, or while the system
  // state doesn't allow a drag shot to start either.
  function triggerFallbackShot() {
    if (isInteractionBusy(getInteractionSnapshot().phase)) return
    if (!DRAG_ALLOWED_STATES.has(systemStateRef.current)) return
    const rect = rootRef.current?.getBoundingClientRect()
    box.current = rect ? { width: rect.width, height: rect.height } : null
    runShot(FALLBACK_SHOT_DRAG)
  }

  useCoreGesture(rootRef, {
    enabled: interactive,
    dragThresholdPx: 12,
    onPressStart: () => {
      clearTimers()
      const rect = rootRef.current?.getBoundingClientRect()
      box.current = rect ? { width: rect.width, height: rect.height } : null
      dragAllowed.current = DRAG_ALLOWED_STATES.has(systemStateRef.current)
      setInteractionSnapshot({ phase: 'pressed' })
    },
    onDragStart: () => {
      if (!dragAllowed.current) return
      playSound('coreGrab')
      setInteractionSnapshot({ phase: 'grabbed', dragDelta: { x: 0, y: 0 } })
    },
    onDragMove: (current, start) => {
      if (!dragAllowed.current) return
      const dPercent = toPercent(current.x - start.x, current.y - start.y)
      setInteractionSnapshot({ phase: 'aiming', dragDelta: dPercent })
      // A gentle "give" toward the pull, not a 1:1 follow — reads as an
      // elastic pull rather than the Core simply tracking the pointer.
      setOffset((current.x - start.x) * 0.18, (current.y - start.y) * 0.18)
    },
    onGestureEnd: (result) => {
      if (result.kind === 'tap') {
        const response = pickResponse(TAP_RESPONSES, lastTapResponse.current)
        lastTapResponse.current = response
        const intensity = Math.max(0.25, Math.min(1, result.pressure * 0.6 + (1 - Math.min(1, result.durationMs / 400)) * 0.4))
        rootRef.current?.style.setProperty('--tap-intensity', intensity.toFixed(2))
        playSound('coreTap')
        setInteractionSnapshot({ phase: 'tap-react', tapResponse: response })
        clearTimers()
        timeoutId.current = setTimeout(() => resetInteraction(), reducedRef.current ? 0 : TAP_DURATION_MS)
        return
      }

      // A drag that was disallowed at the moment it started (system was busy)
      // ends silently — no shot, no sound, nothing left mid-air or mid-pull.
      if (!dragAllowed.current) {
        setOffset(0, 0)
        resetInteraction()
        return
      }

      const dPercent = toPercent(result.end.x - result.start.x, result.end.y - result.start.y)
      runShot(dPercent)
    },
    onCancel: () => {
      clearTimers()
      setOffset(0, 0)
      resetInteraction()
    },
  })

  // Leaving the view (or turning interaction off) never leaves a dangling
  // animation or a Core stuck off-centre.
  useEffect(() => {
    return () => {
      clearTimers()
      resetInteraction()
    }
  }, [])

  return { triggerFallbackShot }
}
