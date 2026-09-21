import { useSyncExternalStore } from 'react'
import { getCoreSnapshot, subscribeCore } from '../logic/coreStore.ts'

// The Jarvis Core's current state. Anything in the interface that needs to
// know what Jarvis is doing reads it here, so there is one truth.
export function useCoreState() {
  return useSyncExternalStore(subscribeCore, getCoreSnapshot, getCoreSnapshot)
}
