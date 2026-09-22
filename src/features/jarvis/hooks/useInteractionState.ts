import { useSyncExternalStore } from 'react'
import { getInteractionSnapshot, subscribeInteraction } from '../logic/interactionStore.ts'

// The Core Interaction Engine's current state — the interaction-engine
// mirror of useCoreState.ts, reading a completely separate store. A
// component can safely read both without either ever influencing the other.
export function useInteractionState() {
  return useSyncExternalStore(subscribeInteraction, getInteractionSnapshot, getInteractionSnapshot)
}
