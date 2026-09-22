// External store for Core interaction state — the interaction-engine mirror
// of coreStore.ts, and deliberately a SEPARATE module: nothing here imports
// coreStore.ts, and coreStore.ts/coreState.ts import nothing from here. That
// separation is the actual guarantee that a game (tap, basketball, or any
// future one) cannot corrupt the real system state — there is no shared
// object, no shared setter, not even a shared type, for the two to collide
// through. React reads this through useInteractionState.ts.
import { IDLE_INTERACTION } from './interactionState.ts'
import type { InteractionSnapshot } from './interactionState.ts'

let snapshot: InteractionSnapshot = IDLE_INTERACTION
const listeners = new Set<() => void>()

export function getInteractionSnapshot(): InteractionSnapshot {
  return snapshot
}

export function setInteractionSnapshot(next: InteractionSnapshot): void {
  snapshot = next
  listeners.forEach((l) => l())
}

export function resetInteraction(): void {
  setInteractionSnapshot(IDLE_INTERACTION)
}

export function subscribeInteraction(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
