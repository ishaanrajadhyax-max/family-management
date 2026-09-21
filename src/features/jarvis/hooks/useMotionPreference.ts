import { useSyncExternalStore } from 'react'

// "system" follows the operating system's reduced-motion setting; the user can
// also force reduced or full motion from Settings.
export type MotionPreference = 'system' | 'reduced' | 'full'

const KEY = 'jarvis.motion'
const listeners = new Set<() => void>()

function readPreference(): MotionPreference {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'reduced' || v === 'full' ? v : 'system'
  } catch {
    return 'system'
  }
}

let preference: MotionPreference = readPreference()

export function setMotionPreference(next: MotionPreference) {
  preference = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // not persisted; still applies for this session
  }
  listeners.forEach((l) => l())
}

const subscribePreference = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useMotionPreference(): MotionPreference {
  return useSyncExternalStore(subscribePreference, () => preference, () => 'system' as MotionPreference)
}

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribeSystem(l: () => void) {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', l)
  return () => mq.removeEventListener('change', l)
}

// True when animation should be minimised (system setting, or forced in Settings).
export function useReducedMotion(): boolean {
  const pref = useMotionPreference()
  const system = useSyncExternalStore(subscribeSystem, () => window.matchMedia(QUERY).matches, () => false)
  return pref === 'reduced' || (pref === 'system' && system)
}
