// The one place UI sound is played and configured. Every other file asks this
// module (playSound / playClick); none of them touches audio directly.
//
// - Sounds are synthesized here from the specs in logic/soundSpec.ts.
// - It owns a SEPARATE AudioContext from Jarvis's voice, and never touches the
//   voice pipeline (useSpeechOutput / speechDsp).
// - Browsers only allow audio after a user gesture, so nothing plays (and no
//   audio context exists) until the first click or keypress; a sound requested
//   before then is simply dropped, never queued.
// - Enabled state and volume persist in localStorage; the default is OFF when
//   the system prefers reduced motion.
import { getCoreSnapshot } from './logic/coreStore.ts'
import { DEFAULT_VOLUME, defaultSoundEnabled, shouldPlay, SOUNDS, volumeToGain } from './logic/soundSpec.ts'
import type { SoundName, Tone } from './logic/soundSpec.ts'

const KEY_ENABLED = 'jarvis.sound.enabled'
const KEY_VOLUME = 'jarvis.sound.volume'

export interface SoundSettings {
  enabled: boolean
  volume: number // 0..1
}

function readStorage(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage blocked (private mode etc.): the setting just won't persist.
  }
}

function initialSettings(): SoundSettings {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const storedVolume = Number(readStorage(KEY_VOLUME))
  return {
    enabled: defaultSoundEnabled(Boolean(reduced), readStorage(KEY_ENABLED)),
    volume: readStorage(KEY_VOLUME) !== null && Number.isFinite(storedVolume) ? Math.min(1, Math.max(0, storedVolume)) : DEFAULT_VOLUME,
  }
}

let settings: SoundSettings = initialSettings()
const listeners = new Set<() => void>()

export function getSoundSettings(): SoundSettings {
  return settings
}

export function subscribeSoundSettings(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function update(next: SoundSettings) {
  settings = next
  listeners.forEach((l) => l())
}

export function setSoundEnabled(enabled: boolean) {
  writeStorage(KEY_ENABLED, String(enabled))
  update({ ...settings, enabled })
}

export function setSoundVolume(volume: number) {
  const v = Math.min(1, Math.max(0, volume))
  writeStorage(KEY_VOLUME, String(v))
  update({ ...settings, volume: v })
}

// ---- Scheduling (kept free of module state so it can run in an OfflineAudioContext for tests) ----

// Plays one sound's tones into `destination`, starting at `startTime`.
export function scheduleSound(ctx: BaseAudioContext, destination: AudioNode, tones: readonly Tone[], startTime: number) {
  for (const tone of tones) {
    const t0 = startTime + tone.at
    const osc = ctx.createOscillator()
    osc.type = tone.type
    osc.frequency.setValueAtTime(tone.freq, t0)
    if (tone.endFreq) osc.frequency.exponentialRampToValueAtTime(tone.endFreq, t0 + tone.dur)

    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, t0)
    env.gain.linearRampToValueAtTime(tone.gain, t0 + 0.004)
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + tone.dur)

    if (tone.lowpass) {
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = tone.lowpass
      osc.connect(filter)
      filter.connect(env)
    } else {
      osc.connect(env)
    }
    env.connect(destination)
    osc.start(t0)
    osc.stop(t0 + tone.dur + 0.02)
  }
}

// ---- Live engine ----

let ctx: AudioContext | null = null
let master: GainNode | null = null

function ensureContext(): AudioContext | null {
  if (ctx) return ctx
  const Ctor =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
  if (!Ctor) return null
  ctx = new Ctor()
  master = ctx.createGain()
  // A gentle limiter after the master gain: whatever happens, cues can't spike.
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -10
  limiter.knee.value = 0
  limiter.ratio.value = 12
  limiter.attack.value = 0.003
  limiter.release.value = 0.05
  master.connect(limiter)
  limiter.connect(ctx.destination)
  return ctx
}

// Called from the first user gesture. Creating/resuming the context outside a
// gesture would be refused by the browser, so this is the only place it happens.
export function unlockSound() {
  const c = ensureContext()
  if (c && c.state === 'suspended') void c.resume()
}

const lastPlayed = new Map<SoundName, number>()
let recent: number[] = []
let pendingClick: ReturnType<typeof setTimeout> | null = null

export function playSound(name: SoundName) {
  if (name !== 'click' && pendingClick !== null) {
    // A more specific sound is coming for the same action: drop the generic click.
    clearTimeout(pendingClick)
    pendingClick = null
  }
  if (!shouldPlay(name, { enabled: settings.enabled, coreState: getCoreSnapshot().state })) return
  const c = ctx
  if (!c || !master || c.state !== 'running') return // no gesture yet (or blocked): stay silent

  const now = performance.now()
  if (now - (lastPlayed.get(name) ?? -1000) < 35) return // no machine-gun repeats
  recent = recent.filter((t) => now - t < 1000)
  if (recent.length >= 6) return
  recent.push(now)
  lastPlayed.set(name, now)

  master.gain.setValueAtTime(volumeToGain(settings.volume), c.currentTime)
  scheduleSound(c, master, SOUNDS[name], c.currentTime + 0.005)
}

// Generic button click, deferred by a moment so a specific sound for the same
// action (panel open, mode switch, thinking...) can replace it instead of both playing.
export function playClick() {
  if (pendingClick !== null) clearTimeout(pendingClick)
  pendingClick = setTimeout(() => {
    pendingClick = null
    playSound('click')
  }, 45)
}
