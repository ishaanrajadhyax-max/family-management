import { useEffect, useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'

// A generic press/drag gesture detector for one element — mouse and touch
// unified via the Pointer Events API, nothing here knows what a "Core" or a
// "basketball" is. This is the reusable part of the Interaction Engine any
// future interaction (Pong, catch, a reaction test, ...) can sit on top of:
// it only ever reports raw pixels, timing and a tap/drag classification.
//
// Deliberately does NOT call preventDefault() on a plain tap, so ordinary
// clicks/taps elsewhere on the page are never affected, and does not touch
// anything outside the element it's attached to — page scrolling is
// untouched. `touch-action: none` on the element itself (set in CSS, see
// .j-core) is what lets a real drag be captured without the browser's own
// touch-scroll competing for the gesture; only entered once movement past
// the threshold proves this is really a drag.
export interface Point {
  x: number
  y: number
}

export interface GestureResult {
  kind: 'tap' | 'drag'
  start: Point
  end: Point
  durationMs: number
  pressure: number // 0..1; a real reading on touch/pen, a fixed default for mouse
}

export interface CoreGestureHandlers {
  enabled: boolean
  dragThresholdPx?: number
  onPressStart?: () => void
  onDragStart?: () => void
  onDragMove?: (current: Point, start: Point) => void
  onGestureEnd: (result: GestureResult) => void
  onCancel?: () => void
}

const DEFAULT_THRESHOLD = 10

export function useCoreGesture(ref: RefObject<HTMLElement | null>, handlers: CoreGestureHandlers): void {
  const handlersRef = useRef(handlers)
  useLayoutEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    const el = ref.current
    if (!el || !handlers.enabled) return

    const threshold = handlers.dragThresholdPx ?? DEFAULT_THRESHOLD
    let pointerId: number | null = null
    let start: Point | null = null
    let startTime = 0
    let pressure = 0.5
    let dragging = false

    function onPointerDown(e: PointerEvent) {
      if (pointerId !== null) return // a gesture is already in progress
      if (e.button !== undefined && e.button !== 0) return // primary button/first touch only
      pointerId = e.pointerId
      start = { x: e.clientX, y: e.clientY }
      startTime = performance.now()
      pressure = e.pressure > 0 ? e.pressure : 0.5
      dragging = false
      el?.setPointerCapture(e.pointerId)
      handlersRef.current.onPressStart?.()
    }

    function onPointerMove(e: PointerEvent) {
      if (pointerId !== e.pointerId || !start) return
      const current = { x: e.clientX, y: e.clientY }
      const dist = Math.hypot(current.x - start.x, current.y - start.y)
      if (!dragging && dist >= threshold) {
        dragging = true
        handlersRef.current.onDragStart?.()
      }
      if (dragging) {
        e.preventDefault() // only once it's really a drag — never blocks a tap or page scroll
        handlersRef.current.onDragMove?.(current, start)
      }
    }

    function finish(e: PointerEvent) {
      if (pointerId !== e.pointerId || !start) return
      const end = { x: e.clientX, y: e.clientY }
      const durationMs = performance.now() - startTime
      const kind: GestureResult['kind'] = dragging ? 'drag' : 'tap'
      handlersRef.current.onGestureEnd({ kind, start, end, durationMs, pressure })
      pointerId = null
      start = null
      dragging = false
    }

    function onPointerUp(e: PointerEvent) {
      finish(e)
    }

    function onPointerCancel(e: PointerEvent) {
      if (pointerId !== e.pointerId) return
      pointerId = null
      start = null
      dragging = false
      handlersRef.current.onCancel?.()
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerCancel)
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerCancel)
    }
  }, [ref, handlers.enabled, handlers.dragThresholdPx])
}
