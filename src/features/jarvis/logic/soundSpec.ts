// The Jarvis UI sound vocabulary: short, soft, synthesized tones (no audio
// files, so nothing to license). Pure data and policy, no audio code: the
// engine in uiSound.ts plays these, and tests check them.

export type SoundName =
  | 'click'
  | 'panelOpen'
  | 'panelClose'
  | 'modeSwitch'
  | 'thinkStart'
  | 'responseReady'
  | 'voiceStart'
  | 'voiceStop'
  | 'memorySaved'
  | 'memoryDeleted'
  | 'approve'
  | 'reject'
  | 'error'
  | 'notify'

export interface Tone {
  at: number // start offset, seconds
  dur: number // seconds
  freq: number // Hz
  endFreq?: number // glide target, Hz
  type: 'sine' | 'triangle'
  gain: number // 0..1 before the master volume
  lowpass?: number // Hz, to soften
}

// Design rules: every sound is under 0.3 s, quiet, mid-range (no shrill highs,
// no thumping lows), sine/triangle only (no harsh edges). Rising = opening /
// starting / success; falling = closing / stopping; low and muted = a problem.
export const SOUNDS: Record<SoundName, Tone[]> = {
  click: [{ at: 0, dur: 0.03, freq: 1900, endFreq: 1500, type: 'sine', gain: 0.32 }],
  panelOpen: [
    { at: 0, dur: 0.07, freq: 520, endFreq: 700, type: 'sine', gain: 0.4 },
    { at: 0.05, dur: 0.09, freq: 780, endFreq: 980, type: 'sine', gain: 0.32 },
  ],
  panelClose: [
    { at: 0, dur: 0.07, freq: 780, endFreq: 600, type: 'sine', gain: 0.34 },
    { at: 0.05, dur: 0.09, freq: 560, endFreq: 420, type: 'sine', gain: 0.28 },
  ],
  modeSwitch: [
    { at: 0, dur: 0.11, freq: 420, endFreq: 900, type: 'triangle', gain: 0.3, lowpass: 3000 },
    { at: 0.06, dur: 0.08, freq: 1300, type: 'sine', gain: 0.16 },
  ],
  thinkStart: [
    { at: 0, dur: 0.14, freq: 200, endFreq: 260, type: 'sine', gain: 0.4 },
    { at: 0.05, dur: 0.12, freq: 300, endFreq: 390, type: 'sine', gain: 0.2 },
  ],
  responseReady: [
    { at: 0, dur: 0.09, freq: 660, type: 'sine', gain: 0.34 },
    { at: 0.08, dur: 0.14, freq: 990, type: 'sine', gain: 0.34 },
  ],
  voiceStart: [
    { at: 0, dur: 0.11, freq: 440, endFreq: 680, type: 'sine', gain: 0.38 },
    { at: 0.07, dur: 0.06, freq: 900, type: 'sine', gain: 0.18 },
  ],
  voiceStop: [{ at: 0, dur: 0.11, freq: 680, endFreq: 420, type: 'sine', gain: 0.34 }],
  memorySaved: [
    { at: 0, dur: 0.06, freq: 740, type: 'sine', gain: 0.32 },
    { at: 0.06, dur: 0.06, freq: 1110, type: 'sine', gain: 0.32 },
    { at: 0.12, dur: 0.14, freq: 1480, type: 'sine', gain: 0.2 },
  ],
  memoryDeleted: [{ at: 0, dur: 0.1, freq: 520, endFreq: 300, type: 'triangle', gain: 0.3, lowpass: 2200 }],
  approve: [
    { at: 0, dur: 0.05, freq: 600, type: 'sine', gain: 0.3 },
    { at: 0.05, dur: 0.05, freq: 900, type: 'sine', gain: 0.3 },
    { at: 0.1, dur: 0.12, freq: 1200, type: 'sine', gain: 0.28 },
  ],
  reject: [
    { at: 0, dur: 0.05, freq: 320, type: 'triangle', gain: 0.34, lowpass: 1800 },
    { at: 0.07, dur: 0.07, freq: 260, type: 'triangle', gain: 0.3, lowpass: 1800 },
  ],
  error: [
    { at: 0, dur: 0.09, freq: 190, type: 'triangle', gain: 0.5, lowpass: 900 },
    { at: 0.11, dur: 0.11, freq: 150, type: 'triangle', gain: 0.5, lowpass: 900 },
  ],
  notify: [
    { at: 0, dur: 0.06, freq: 1000, type: 'sine', gain: 0.28 },
    { at: 0.05, dur: 0.08, freq: 1350, type: 'sine', gain: 0.2 },
  ],
}

export const SOUND_NAMES = Object.keys(SOUNDS) as SoundName[]

// Loudest the whole UI-sound layer can ever get (before the user's volume).
// Deliberately low: these are cues, not alerts.
export const MASTER_MAX = 0.5
export const DEFAULT_VOLUME = 0.6

export function soundDuration(name: SoundName): number {
  return Math.max(...SOUNDS[name].map((t) => t.at + t.dur))
}

// Squared so the slider feels even and the bottom of its range is genuinely quiet.
export function volumeToGain(volume01: number): number {
  const v = Math.min(1, Math.max(0, volume01))
  return MASTER_MAX * v * v
}

// Sound is ON by default unless the system asks for reduced motion; an
// explicit choice by the user always wins.
export function defaultSoundEnabled(prefersReducedMotion: boolean, stored: string | null): boolean {
  if (stored === 'true') return true
  if (stored === 'false') return false
  return !prefersReducedMotion
}

// Never talk over Jarvis, and never make noise while the microphone is open
// (the app would hear itself). Only the voice cues themselves, and errors
// while speaking, get through.
export function shouldPlay(name: SoundName, ctx: { enabled: boolean; coreState: string }): boolean {
  if (!ctx.enabled) return false
  if (ctx.coreState === 'listening') return name === 'voiceStart' || name === 'voiceStop'
  if (ctx.coreState === 'speaking') return name === 'error' || name === 'voiceStart' || name === 'voiceStop'
  return true
}

// Which sound (if any) a change of core state should trigger. The one place
// that maps core transitions to sound.
export function soundForTransition(
  prev: { state: string; detail: string },
  next: { state: string; detail: string },
): SoundName | null {
  if (next.state === 'error' && prev.state !== 'error') return 'error'
  if (next.state === 'listening' && prev.state !== 'listening') return 'voiceStart'
  if (prev.state === 'listening' && next.state !== 'listening') return 'voiceStop'
  const wasProcessing = prev.state === 'thinking' && prev.detail === 'PROCESSING'
  const isProcessing = next.state === 'thinking' && next.detail === 'PROCESSING'
  if (isProcessing && !wasProcessing) return 'thinkStart'
  if (wasProcessing && !isProcessing && next.state !== 'error') return 'responseReady'
  return null
}
