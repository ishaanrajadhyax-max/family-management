// Loudness and clarity processing for Jarvis's spoken replies.
//
// Unreal Speech's "Will" arrives quiet and soft: its peaks are already close
// to full scale (about -3 dBFS) while its average speech level is low (about
// -20 dBFS), so simply turning it up would clip. It also has a heavy
// low-mid "body" (150-800 Hz) and weak presence (2-7 kHz), which reads as
// muffled. This module fixes those with the standard broadcast-speech chain:
//
//   high-pass -> EQ (less boxiness, more presence, sibilance guard) -> compressor
//   -> makeup gain measured per reply -> lookahead limiter
//
// Everything here is plain arithmetic on samples (no Web Audio nodes, no DOM),
// so it produces the same result in every browser and can be tested in Node.
// The voice itself (pitch, speed, timbre) is untouched: this only shapes level
// and tonal balance after the audio has been generated.

export const SPEECH_PROCESSING = {
  highpass: { freqHz: 60, q: 0.707 },
  // Peaking EQ bands: { freqHz, gainDb, q }.
  eq: [
    { freqHz: 200, gainDb: -1.5, q: 1.0 }, // less body build-up
    { freqHz: 420, gainDb: -3.0, q: 0.8 }, // less boxy / muffled
    { freqHz: 2800, gainDb: 3.0, q: 1.0 }, // presence and intelligibility
  ],
  // Gentle high shelf that keeps sibilance and hiss in check, so the added
  // presence never turns harsh or "airy".
  highShelf: { freqHz: 6500, gainDb: -2.0 },
  // Fast attack (1 ms) so peaks are caught BEFORE the makeup gain lifts them;
  // that keeps the limiter's job small.
  compressor: { thresholdDb: -25, ratio: 4, kneeDb: 12, attackMs: 1, releaseMs: 150 },
  // The makeup gain is worked out per reply so every reply lands at the same
  // level: target average speech level (about +6 dB louder than the raw
  // audio), never boosted by more than maxGainDb.
  targetRmsDb: -13.5,
  maxGainDb: 28,
  // 10 ms lookahead/smoothing: slower than the ~9 ms period of Will's deep
  // fundamental, so gain changes don't distort the waveform.
  limiter: { ceilingDb: -1, lookaheadMs: 10 },
} as const

// The LIVE volume stage useSpeechOutput.ts inserts after the gain node, so
// boosting past 100% raises loudness without clipping: a DynamicsCompressor
// (loudness) feeding a hard-clamp WaveShaper (an absolute, mathematical
// ceiling — see SAFETY_CLAMP_CURVE below).
//
// These exact values (threshold, knee) were tuned empirically against real
// Chromium output, not derived from the Web Audio spec alone — a
// DynamicsCompressorNode is not a pure "no-op below threshold" gate in
// practice; a small knee measurably colors even sub-threshold content (a
// 0 dB knee at -0.3 dB threshold moved a signal already at the offline
// chain's -1 dB ceiling by about +2% peak — audible, and not what "100%
// matches the shipped baseline" means). Maxing the knee (40 dB, the spec's
// upper bound) made it consistently transparent under gain <= 1.0 (peak
// within ~0.04% of the input — see speechDsp.test.mjs and the browser
// measurement in the mission report). ratio/attack/release are unrelated to
// that finding and were kept at reasonable limiter values.
export const VOLUME_SAFETY_LIMITER = {
  thresholdDb: -1,
  kneeDb: 40,
  ratio: 20,
  attackSec: 0.003,
  releaseSec: 0.1,
} as const

// A hard [-1, 1] clamp, applied via WaveShaperNode as the absolute final
// stage after the compressor above. The compressor alone measurably still
// let sharp transients through slightly over 0 dBFS at 150% volume in real
// Chromium testing (ratio is finite, attack takes a few ms to catch a sharp
// onset) — this guarantees no sample can ever exceed full scale, regardless
// of input material. Must be built with NO oversampling: oversampling's
// reconstruction filter rings at a curve's sharp corner (exactly the corner
// this curve has at ±1), which reintroduced the same overshoot it exists to
// prevent — confirmed by direct measurement, not assumed.
export const SAFETY_CLAMP_CURVE_SIZE = 65536

export function buildSafetyClampCurve(): Float32Array {
  const curve = new Float32Array(SAFETY_CLAMP_CURVE_SIZE)
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1
    curve[i] = Math.max(-1, Math.min(1, x))
  }
  return curve
}

const toLinear = (db: number) => 10 ** (db / 20)
const toDb = (x: number) => 20 * Math.log10(Math.max(x, 1e-9))

interface Biquad {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

// RBJ "Audio EQ Cookbook" coefficients.
function highpass(sampleRate: number, freqHz: number, q: number): Biquad {
  const w0 = (2 * Math.PI * freqHz) / sampleRate
  const cos = Math.cos(w0)
  const alpha = Math.sin(w0) / (2 * q)
  const a0 = 1 + alpha
  return { b0: (1 + cos) / 2 / a0, b1: -(1 + cos) / a0, b2: (1 + cos) / 2 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 }
}

function peaking(sampleRate: number, freqHz: number, gainDb: number, q: number): Biquad {
  const A = 10 ** (gainDb / 40)
  const w0 = (2 * Math.PI * freqHz) / sampleRate
  const cos = Math.cos(w0)
  const alpha = Math.sin(w0) / (2 * q)
  const a0 = 1 + alpha / A
  return { b0: (1 + alpha * A) / a0, b1: (-2 * cos) / a0, b2: (1 - alpha * A) / a0, a1: (-2 * cos) / a0, a2: (1 - alpha / A) / a0 }
}

function highShelf(sampleRate: number, freqHz: number, gainDb: number): Biquad {
  const A = 10 ** (gainDb / 40)
  const w0 = (2 * Math.PI * freqHz) / sampleRate
  const cos = Math.cos(w0)
  const alpha = Math.sin(w0) / 2 / Math.SQRT2 // shelf slope S = 1
  const sq = 2 * Math.sqrt(A) * alpha
  const a0 = A + 1 - (A - 1) * cos + sq
  return {
    b0: (A * (A + 1 + (A - 1) * cos + sq)) / a0,
    b1: (-2 * A * (A - 1 + (A + 1) * cos)) / a0,
    b2: (A * (A + 1 + (A - 1) * cos - sq)) / a0,
    a1: (2 * (A - 1 - (A + 1) * cos)) / a0,
    a2: (A + 1 - (A - 1) * cos - sq) / a0,
  }
}

// Direct form I, double precision state.
function applyBiquad(x: Float32Array, f: Biquad): Float32Array {
  const y = new Float32Array(x.length)
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  for (let i = 0; i < x.length; i++) {
    const v = f.b0 * x[i] + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2
    x2 = x1
    x1 = x[i]
    y2 = y1
    y1 = v
    y[i] = v
  }
  return y
}

// Feed-forward compressor: peak envelope follower (fast attack, slow release)
// driving a soft-knee gain computer. Returns the audio and the deepest gain
// reduction applied, in dB.
function compress(x: Float32Array, sampleRate: number): { out: Float32Array; maxReductionDb: number } {
  const { thresholdDb, ratio, kneeDb, attackMs, releaseMs } = SPEECH_PROCESSING.compressor
  const attack = Math.exp(-1 / ((sampleRate * attackMs) / 1000))
  const release = Math.exp(-1 / ((sampleRate * releaseMs) / 1000))
  const slope = 1 / ratio - 1
  const out = new Float32Array(x.length)
  let env = 0
  let maxReductionDb = 0
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i])
    env = a > env ? attack * env + (1 - attack) * a : release * env + (1 - release) * a
    const over = toDb(env) - thresholdDb
    let reduction = 0
    if (2 * over > kneeDb) reduction = slope * over
    else if (2 * over > -kneeDb) reduction = (slope * (over + kneeDb / 2) ** 2) / (2 * kneeDb)
    if (reduction < maxReductionDb) maxReductionDb = reduction
    out[i] = x[i] * toLinear(reduction)
  }
  return { out, maxReductionDb }
}

// Average level of the speech itself: 50 ms blocks louder than -50 dBFS, so
// pauses don't drag the number down. Returns null if there is no speech.
export function activeRmsDb(x: Float32Array, sampleRate: number): number | null {
  const block = Math.max(1, Math.round(sampleRate * 0.05))
  const gate = toLinear(-50)
  let sum = 0
  let count = 0
  for (let start = 0; start + block <= x.length; start += block) {
    let e = 0
    for (let i = 0; i < block; i++) e += x[start + i] * x[start + i]
    if (Math.sqrt(e / block) > gate) {
      sum += e
      count += block
    }
  }
  return count === 0 ? null : toDb(Math.sqrt(sum / count))
}

export function peakDb(x: Float32Array): number {
  let peak = 0
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]))
  return toDb(peak)
}

// Lookahead peak limiter. Each sample's needed gain is spread backwards over
// the lookahead window (sliding minimum) and then smoothed by a moving
// average of the same length, which guarantees the applied gain at every
// sample is at most what that sample needs: the output never exceeds the
// ceiling, and gain ramps in and out over a few milliseconds rather than
// snapping (which would distort).
function limit(x: Float32Array, sampleRate: number): { out: Float32Array; maxReductionDb: number; activeFraction: number } {
  const ceiling = toLinear(SPEECH_PROCESSING.limiter.ceilingDb)
  const n = Math.max(1, Math.round((sampleRate * SPEECH_PROCESSING.limiter.lookaheadMs) / 1000))
  const len = x.length
  const needed = new Float32Array(len)
  for (let i = 0; i < len; i++) {
    const a = Math.abs(x[i])
    needed[i] = a > ceiling ? ceiling / a : 1
  }

  // gm[j] = min(needed[j .. j+n]) via a monotonic deque.
  const gm = new Float32Array(len)
  const deque = new Int32Array(len)
  let head = 0
  let tail = 0
  for (let j = len - 1; j >= 0; j--) {
    while (tail > head && deque[head] > j + n) head++
    while (tail > head && needed[deque[tail - 1]] >= needed[j]) tail--
    deque[tail++] = j
    gm[j] = needed[deque[head]]
  }

  // applied[i] = mean(gm[i-n .. i]). Before the start of the audio the window is padded with
  // the first gain value (not 1): padding with "no reduction" would let the first few
  // milliseconds through above the ceiling.
  const prefix = new Float64Array(len + 1)
  for (let i = 0; i < len; i++) prefix[i + 1] = prefix[i] + gm[i]
  const out = new Float32Array(len)
  let minGain = 1
  let active = 0
  const audible = toLinear(-1) // "working" = taking off more than 1 dB
  for (let i = 0; i < len; i++) {
    const from = i - n
    const sum = prefix[i + 1] - prefix[Math.max(0, from)] + (from < 0 ? -from * gm[0] : 0)
    const g = sum / (n + 1)
    if (g < minGain) minGain = g
    if (g < audible) active++
    out[i] = x[i] * g
  }
  return { out, maxReductionDb: toDb(minGain), activeFraction: len === 0 ? 0 : active / len }
}

// Encodes mono Float32 samples as a 16-bit PCM WAV file. Used so the
// already-processed reply can be played through an HTMLAudioElement instead
// of a raw AudioBufferSourceNode — only a media element's playbackRate is
// pitch-preserving (time-stretching, not simple resampling), which is what
// lets the speed control change pace without changing Will's pitch. Plain
// arithmetic, no DOM: testable in Node like the rest of this module.
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytesPerSample = 2
  const blockAlign = bytesPerSample // mono
  const dataSize = samples.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true) // byte rate
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bytesPerSample * 8, true) // bits per sample
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return buffer
}

export interface SpeechProcessingReport {
  inputRmsDb: number | null
  inputPeakDb: number
  compressorMaxReductionDb: number
  makeupGainDb: number
  limiterMaxReductionDb: number
  // Share of samples where the limiter took off more than 1 dB (should be tiny).
  limiterActiveFraction: number
  outputRmsDb: number | null
  outputPeakDb: number
}

function scale(x: Float32Array, gain: number): Float32Array {
  const y = new Float32Array(x.length)
  for (let i = 0; i < x.length; i++) y[i] = x[i] * gain
  return y
}

// Runs the whole chain on one mono reply. Silence (or a clip with no speech)
// passes through unchanged.
export function processSpeech(input: Float32Array, sampleRate: number): { samples: Float32Array; report: SpeechProcessingReport } {
  const inputRmsDb = activeRmsDb(input, sampleRate)
  const inputPeakDb = peakDb(input)
  if (inputRmsDb === null) {
    return { samples: input, report: { inputRmsDb, inputPeakDb, compressorMaxReductionDb: 0, makeupGainDb: 0, limiterMaxReductionDb: 0, limiterActiveFraction: 0, outputRmsDb: null, outputPeakDb: inputPeakDb } }
  }

  let x = applyBiquad(input, highpass(sampleRate, SPEECH_PROCESSING.highpass.freqHz, SPEECH_PROCESSING.highpass.q))
  for (const band of SPEECH_PROCESSING.eq) x = applyBiquad(x, peaking(sampleRate, band.freqHz, band.gainDb, band.q))
  x = applyBiquad(x, highShelf(sampleRate, SPEECH_PROCESSING.highShelf.freqHz, SPEECH_PROCESSING.highShelf.gainDb))
  const compressed = compress(x, sampleRate)

  // Makeup gain: enough to bring the compressed speech to the target level,
  // then re-measured AFTER the limiter (which trims a little) and nudged, so
  // the delivered level really is the target.
  let makeupGainDb = Math.min(
    SPEECH_PROCESSING.maxGainDb,
    Math.max(0, SPEECH_PROCESSING.targetRmsDb - (activeRmsDb(compressed.out, sampleRate) ?? inputRmsDb)),
  )
  let limited = limit(scale(compressed.out, toLinear(makeupGainDb)), sampleRate)
  for (let pass = 0; pass < 3; pass++) {
    const level = activeRmsDb(limited.out, sampleRate)
    if (level === null || Math.abs(SPEECH_PROCESSING.targetRmsDb - level) < 0.15 || makeupGainDb >= SPEECH_PROCESSING.maxGainDb) break
    makeupGainDb = Math.min(SPEECH_PROCESSING.maxGainDb, makeupGainDb + (SPEECH_PROCESSING.targetRmsDb - level))
    limited = limit(scale(compressed.out, toLinear(makeupGainDb)), sampleRate)
  }
  const samples = limited.out
  return {
    samples,
    report: {
      inputRmsDb,
      inputPeakDb,
      compressorMaxReductionDb: compressed.maxReductionDb,
      makeupGainDb,
      limiterMaxReductionDb: limited.maxReductionDb,
      limiterActiveFraction: limited.activeFraction,
      outputRmsDb: activeRmsDb(samples, sampleRate),
      outputPeakDb: peakDb(samples),
    },
  }
}
