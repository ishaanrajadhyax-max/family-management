// Tiny external store for the Jarvis Core (no React here, so audio code and
// hooks can both write to it). React reads it through useCoreState.ts.
import { coreDetail, deriveCoreState, EMPTY_SIGNALS } from './coreState.ts'
import type { CoreSignals, CoreSnapshot } from './coreState.ts'

let signals: CoreSignals = EMPTY_SIGNALS
let snapshot: CoreSnapshot = { state: 'idle', detail: '' }
const listeners = new Set<() => void>()

export function setCoreSignal(name: keyof CoreSignals, value: boolean) {
  if (signals[name] === value) return
  signals = { ...signals, [name]: value }
  const next: CoreSnapshot = { state: deriveCoreState(signals), detail: coreDetail(signals) }
  if (next.state === snapshot.state && next.detail === snapshot.detail) return
  snapshot = next
  listeners.forEach((l) => l())
}

// A stable object between changes, as useSyncExternalStore requires.
export function getCoreSnapshot(): CoreSnapshot {
  return snapshot
}

export function subscribeCore(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Real audio activity (0..1) for the two states that have one. A source
// returns null when it has no measurement (e.g. the browser voice exposes no
// audio), and the core then shows a state animation instead of a level.
type LevelSource = () => number | null
const sources: { listening: LevelSource | null; speaking: LevelSource | null } = { listening: null, speaking: null }

export function setLevelSource(kind: 'listening' | 'speaking', source: LevelSource | null) {
  sources[kind] = source
}

export function readCoreLevel(): number | null {
  if (snapshot.state === 'speaking') return sources.speaking?.() ?? null
  if (snapshot.state === 'listening') return sources.listening?.() ?? null
  return null
}
