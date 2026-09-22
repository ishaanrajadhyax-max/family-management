// Jarvis's own spoken-voice playback settings: speed and volume. Completely
// separate from uiSound.ts's UI-cue volume (different store, different
// localStorage keys, different signal path) — muting or boosting Jarvis's
// voice must never touch click/toast sounds, and vice versa.
//
// These are PLAYBACK settings, not generation settings: they never cause a
// re-fetch from /api/jarvis/speech and never touch the Unreal "Will" voice
// itself. useSpeechOutput.ts applies them to the already-generated audio at
// play time (speed via pitch-preserving HTMLMediaElement.playbackRate,
// volume via a Web Audio gain + safety-limiter stage — see there).

const KEY_SPEED = 'jarvis.voice.speed'
const KEY_VOLUME = 'jarvis.voice.volume'

export const DEFAULT_SPEED = 1.0
export const SPEED_MIN = 0.5
export const SPEED_MAX = 1.6

export const DEFAULT_VOLUME = 100 // percent
export const VOLUME_MIN = 0
export const VOLUME_MAX = 150

const clampSpeed = (v: number) => Math.min(SPEED_MAX, Math.max(SPEED_MIN, v))
const clampVolume = (v: number) => Math.min(VOLUME_MAX, Math.max(VOLUME_MIN, v))

function readStored(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    const n = Number(raw)
    return Number.isFinite(n) ? n : fallback
  } catch {
    return fallback
  }
}

function writeStored(key: string, value: number) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // Storage blocked (private mode etc.): the setting just won't persist.
  }
}

let speed = clampSpeed(readStored(KEY_SPEED, DEFAULT_SPEED))
let volume = clampVolume(readStored(KEY_VOLUME, DEFAULT_VOLUME))
const listeners = new Set<() => void>()

export interface VoicePlaybackSettings {
  speed: number // 0.5..1.6, playback rate multiplier
  volume: number // 0..150, percent (100 = today's shipped loudness)
}

function snapshot(): VoicePlaybackSettings {
  return { speed, volume }
}
let cached = snapshot()

function notify() {
  cached = snapshot()
  listeners.forEach((l) => l())
}

export function getVoicePlaybackSettings(): VoicePlaybackSettings {
  return cached
}

export function subscribeVoicePlaybackSettings(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setVoiceSpeed(next: number) {
  const v = clampSpeed(next)
  if (v === speed) return
  speed = v
  writeStored(KEY_SPEED, v)
  notify()
}

export function setVoiceVolume(next: number) {
  const v = clampVolume(next)
  if (v === volume) return
  volume = v
  writeStored(KEY_VOLUME, v)
  notify()
}

// 0..1, for APIs that only accept a native 0..1 range (HTMLMediaElement.volume,
// SpeechSynthesisUtterance.volume) — used only by the fallback playback paths,
// which have no Web Audio graph to boost above 100% with. The primary server-
// voice path uses the full 0..150 range via a live gain node instead (see
// useSpeechOutput.ts) — this clamp is never applied there.
export function volumeToNativeRange(percent: number): number {
  return Math.min(1, Math.max(0, percent / 100))
}
