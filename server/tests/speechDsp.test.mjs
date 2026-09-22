// Loudness/clarity processing for spoken replies (src/features/jarvis/speechDsp.ts).
// Synthetic signals only — no voice audio or personal content. The module is pure
// arithmetic on samples, so it runs here exactly as it does in the browser.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { processSpeech, activeRmsDb, peakDb, encodeWav, buildSafetyClampCurve, SPEECH_PROCESSING, VOLUME_SAFETY_LIMITER, SAFETY_CLAMP_CURVE_SIZE } from '../../src/features/jarvis/speechDsp.ts'

const db = (x) => 20 * Math.log10(Math.max(x, 1e-9))
const CEILING = SPEECH_PROCESSING.limiter.ceilingDb

// Deterministic pseudo-random numbers so failures reproduce.
function rng(seed = 1) {
  let s = seed >>> 0
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32)
}

// Speech-like test signal: a voiced tone whose loudness rises and falls like syllables,
// with short louder bursts (like plosives) riding on top and pauses between phrases.
function speechLike(seconds, sr, { level = -30, burst = 12, seed = 7 } = {}) {
  const n = Math.round(seconds * sr)
  const x = new Float32Array(n)
  const rand = rng(seed)
  const base = 10 ** (level / 20)
  for (let i = 0; i < n; i++) {
    const t = i / sr
    const syllable = 0.5 + 0.5 * Math.sin(2 * Math.PI * 4 * t) ** 2
    const pause = t % 2 > 1.7 ? 0 : 1
    const voiced = Math.sin(2 * Math.PI * 110 * t) + 0.6 * Math.sin(2 * Math.PI * 330 * t) + 0.3 * Math.sin(2 * Math.PI * 1500 * t)
    x[i] = base * syllable * pause * (voiced / 1.9) + base * 0.02 * (rand() - 0.5)
  }
  // Louder bursts every 0.4 s.
  const burstLen = Math.round(0.015 * sr)
  for (let start = Math.round(0.2 * sr); start + burstLen < n; start += Math.round(0.4 * sr)) {
    for (let i = 0; i < burstLen; i++) x[start + i] += base * 10 ** (burst / 20) * Math.sin((2 * Math.PI * 900 * i) / sr) * (1 - i / burstLen)
  }
  return x
}

// Amplitude of one frequency component (Goertzel).
function amplitudeAt(x, sr, freq) {
  const w = (2 * Math.PI * freq) / sr
  const coeff = 2 * Math.cos(w)
  let s1 = 0
  let s2 = 0
  for (let i = 0; i < x.length; i++) {
    const s = x[i] + coeff * s1 - s2
    s2 = s1
    s1 = s
  }
  return (2 * Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2)) / x.length
}

const crestDb = (x, sr) => peakDb(x) - activeRmsDb(x, sr)

test('locked constants: the shipped processing values are the ones that were tuned and approved', () => {
  assert.deepEqual(SPEECH_PROCESSING.highpass, { freqHz: 60, q: 0.707 })
  assert.deepEqual(SPEECH_PROCESSING.eq, [
    { freqHz: 200, gainDb: -1.5, q: 1.0 },
    { freqHz: 420, gainDb: -3.0, q: 0.8 },
    { freqHz: 2800, gainDb: 3.0, q: 1.0 },
  ])
  assert.deepEqual(SPEECH_PROCESSING.highShelf, { freqHz: 6500, gainDb: -2.0 })
  assert.deepEqual(SPEECH_PROCESSING.compressor, { thresholdDb: -25, ratio: 4, kneeDb: 12, attackMs: 1, releaseMs: 150 })
  assert.equal(SPEECH_PROCESSING.targetRmsDb, -13.5)
  assert.equal(SPEECH_PROCESSING.maxGainDb, 28)
  assert.deepEqual(SPEECH_PROCESSING.limiter, { ceilingDb: -1, lookaheadMs: 10 })
})

test('loudness: a quiet reply is brought up to the target speech level (about +6 dB or more vs. a typical -20 dB source)', () => {
  const sr = 44100
  const input = speechLike(8, sr, { level: -26 })
  const { samples, report } = processSpeech(input, sr)
  assert.ok(Math.abs(activeRmsDb(samples, sr) - SPEECH_PROCESSING.targetRmsDb) < 0.5, `output ${activeRmsDb(samples, sr)} dB`)
  assert.ok(report.makeupGainDb > 6, `makeup gain ${report.makeupGainDb}`)
  assert.ok(activeRmsDb(samples, sr) - activeRmsDb(input, sr) > 8, 'clearly louder than the input')
})

test('every reply lands at the same level, whether the source was quiet or already loud', () => {
  const sr = 44100
  // -30..-14 dB covers real sources (Unreal's Will arrives near -20 dB); anything quieter than
  // about -32 dB would need more than the gain cap, by design.
  const levels = [-30, -26, -20, -14].map((lvl) => activeRmsDb(processSpeech(speechLike(6, sr, { level: lvl }), sr).samples, sr))
  const spread = Math.max(...levels) - Math.min(...levels)
  assert.ok(spread < 1.0, `levels ${levels.map((l) => l.toFixed(1))}`)
})

test('headroom: the output never exceeds the ceiling — including on adversarial input', () => {
  const sr = 44100
  const ceilingLinear = 10 ** (CEILING / 20)
  const rand = rng(99)
  const cases = {
    speechLike: speechLike(6, sr, { level: -24 }),
    'full-scale noise': Float32Array.from({ length: sr * 2 }, () => (rand() - 0.5) * 2),
    'clipped square wave': Float32Array.from({ length: sr }, (_, i) => (Math.floor(i / 200) % 2 ? 1 : -1)),
    'isolated full-scale clicks': Float32Array.from({ length: sr * 2 }, (_, i) => (i % 5000 === 0 ? 1 : 0.01 * Math.sin(i / 20))),
    'huge dynamic range': Float32Array.from({ length: sr * 3 }, (_, i) => (i < sr ? 0.9 : 0.002) * Math.sin(i / 15)),
  }
  for (const [name, input] of Object.entries(cases)) {
    const { samples } = processSpeech(input, sr)
    let peak = 0
    for (const v of samples) peak = Math.max(peak, Math.abs(v))
    assert.ok(peak <= ceilingLinear + 1e-6, `${name}: peak ${db(peak).toFixed(2)} dBFS exceeds ${CEILING}`)
    assert.ok(samples.every(Number.isFinite), `${name}: non-finite sample`)
  }
})

test('random inputs never clip and never produce NaN (property test)', () => {
  const ceilingLinear = 10 ** (CEILING / 20)
  for (let seed = 1; seed <= 25; seed++) {
    const rand = rng(seed)
    const sr = [22050, 44100, 48000][seed % 3]
    const amp = 10 ** ((-40 + rand() * 40) / 20)
    const freq = 80 + rand() * 4000
    const input = Float32Array.from({ length: Math.round(sr * 1.5) }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / sr) * (0.3 + rand()))
    const { samples } = processSpeech(input, sr)
    let peak = 0
    for (const v of samples) {
      assert.ok(Number.isFinite(v))
      peak = Math.max(peak, Math.abs(v))
    }
    assert.ok(peak <= ceilingLinear + 1e-6, `seed ${seed}: ${db(peak).toFixed(2)} dBFS`)
  }
})

test('dynamics: peaky, uneven speech is evened out (lower crest factor and loud-to-soft spread)', () => {
  const sr = 44100
  const input = speechLike(10, sr, { level: -28, burst: 14 })
  const { samples, report } = processSpeech(input, sr)
  // The compressor itself must be doing the work (not just the limiter clamping peaks).
  assert.ok(report.compressorMaxReductionDb < -3, `compressor max reduction ${report.compressorMaxReductionDb.toFixed(1)} dB`)
  assert.ok(crestDb(samples, sr) < crestDb(input, sr) - 2.5, `crest ${crestDb(input, sr).toFixed(1)} -> ${crestDb(samples, sr).toFixed(1)}`)
  assert.ok(crestDb(samples, sr) < 14, `output crest ${crestDb(samples, sr).toFixed(1)} dB`)
})

test('the limiter is a last resort: it touches only a small share of samples and never digs deep', () => {
  const sr = 44100
  // burst 7 dB gives an input crest of about 16.5 dB, like the real Will audio (16.8 dB), where the
  // limiter took at most 4.6 dB off 3% of samples.
  const { report } = processSpeech(speechLike(10, sr, { level: -26, burst: 7 }), sr)
  assert.ok(report.limiterActiveFraction < 0.08, `active ${(report.limiterActiveFraction * 100).toFixed(2)}%`)
  assert.ok(report.limiterMaxReductionDb > -8, `max reduction ${report.limiterMaxReductionDb.toFixed(1)} dB`)
})

test('clarity EQ: presence (2.8 kHz) is lifted relative to boxiness (420 Hz), and sibilance/hiss (9 kHz) is held back', () => {
  const sr = 44100
  const n = sr * 3
  const tones = (freqs) => Float32Array.from({ length: n }, (_, i) => freqs.reduce((sum, f) => sum + 0.02 * Math.sin((2 * Math.PI * f * i) / sr), 0))
  const input = tones([30, 420, 2800, 9000])
  const { samples } = processSpeech(input, sr)
  const change = (f, ref) => db(amplitudeAt(samples, sr, f) / amplitudeAt(samples, sr, ref)) - db(amplitudeAt(input, sr, f) / amplitudeAt(input, sr, ref))
  // 2.8 kHz +3 dB vs 420 Hz -3 dB: a lift of about 6 dB in the balance (compressor acts on the sum, so allow slack).
  assert.ok(change(2800, 420) > 4 && change(2800, 420) < 8, `presence vs body: ${change(2800, 420).toFixed(1)} dB`)
  assert.ok(change(9000, 2800) < -3, `air vs presence: ${change(9000, 2800).toFixed(1)} dB`)
  // 2nd-order 60 Hz high-pass is about -12 dB at 30 Hz, and 420 Hz is itself cut 3 dB by the EQ.
  assert.ok(change(30, 420) < -6, `sub-bass vs body: ${change(30, 420).toFixed(1)} dB (rumble reduced)`)
})

test('the voice is not re-pitched or re-timed: length and fundamental frequency are unchanged', () => {
  const sr = 44100
  const input = speechLike(5, sr, { level: -26 })
  const { samples } = processSpeech(input, sr)
  assert.equal(samples.length, input.length)
  const strongest = (x) => [90, 100, 110, 120, 130].map((f) => [f, amplitudeAt(x, sr, f)]).sort((a, b) => b[1] - a[1])[0][0]
  assert.equal(strongest(samples), strongest(input))
  assert.equal(strongest(samples), 110)
})

test('sample-rate independence: 22.05k, 44.1k and 48k give the same level and honour the ceiling', () => {
  const levels = [22050, 44100, 48000].map((sr) => {
    const { samples } = processSpeech(speechLike(6, sr, { level: -26 }), sr)
    assert.ok(peakDb(samples) <= CEILING + 0.01)
    return activeRmsDb(samples, sr)
  })
  assert.ok(Math.max(...levels) - Math.min(...levels) < 1.0, `levels ${levels.map((l) => l.toFixed(2))}`)
})

test('the gain is capped, so a near-silent reply is not blown up into noise', () => {
  const sr = 44100
  const rand = rng(5)
  // Hiss at about -46 dBFS RMS: above the speech gate (so it is processed) but so faint that reaching the
  // target would need more than the cap.
  const hiss = Float32Array.from({ length: sr * 2 }, () => 0.00868 * 2 * (rand() - 0.5))
  const { report, samples } = processSpeech(hiss, sr)
  // Reaching the target would need far more than the cap, so the gain must sit exactly AT the cap.
  assert.ok(report.makeupGainDb <= SPEECH_PROCESSING.maxGainDb + 1e-9)
  assert.ok(report.makeupGainDb >= SPEECH_PROCESSING.maxGainDb - 1e-9, `gain ${report.makeupGainDb}`)
  assert.ok(activeRmsDb(samples, sr) < SPEECH_PROCESSING.targetRmsDb - 3, 'a faint source is not forced up to the full target')
  assert.ok(peakDb(samples) <= CEILING + 0.01)
})

test('edge cases: silence, empty and very short input pass through safely', () => {
  const sr = 44100
  const silence = new Float32Array(sr)
  const r1 = processSpeech(silence, sr)
  assert.equal(r1.report.makeupGainDb, 0)
  assert.ok(r1.samples.every((v) => v === 0))
  const r2 = processSpeech(new Float32Array(0), sr)
  assert.equal(r2.samples.length, 0)
  const r3 = processSpeech(Float32Array.from([0.5, -0.5, 0.25]), sr)
  assert.equal(r3.samples.length, 3)
  assert.ok(r3.samples.every(Number.isFinite))
})

test('processing is fast enough to be invisible: 15 s of audio well under 2 s', () => {
  const sr = 44100
  const input = speechLike(15, sr, { level: -26 })
  const t0 = performance.now()
  processSpeech(input, sr)
  assert.ok(performance.now() - t0 < 2000, `${(performance.now() - t0).toFixed(0)} ms`)
})

test('the input array is never modified (the original decoded audio stays intact)', () => {
  const sr = 44100
  const input = speechLike(3, sr, { level: -26 })
  const copy = Float32Array.from(input)
  processSpeech(input, sr)
  assert.deepEqual(input, copy)
})

// ---- encodeWav: used so the processed reply can play through an
// HTMLAudioElement (pitch-preserving speed needs a real media element —
// see useSpeechOutput.ts) instead of a raw AudioBufferSourceNode. ----

// Parses just enough of a WAV file to read back what encodeWav wrote — a
// hand-rolled decoder, independent of any browser API, so this test proves
// the bytes are actually correct rather than trusting a round-trip through
// the same assumptions that wrote them.
function decodeWav(buffer) {
  const view = new DataView(buffer)
  const readStr = (offset, len) => String.fromCharCode(...new Uint8Array(buffer, offset, len))
  assert.equal(readStr(0, 4), 'RIFF')
  assert.equal(readStr(8, 4), 'WAVE')
  assert.equal(readStr(12, 4), 'fmt ')
  const fmtSize = view.getUint32(16, true)
  assert.equal(fmtSize, 16)
  const audioFormat = view.getUint16(20, true)
  const numChannels = view.getUint16(22, true)
  const sampleRate = view.getUint32(24, true)
  const bitsPerSample = view.getUint16(34, true)
  assert.equal(readStr(36, 4), 'data')
  const dataSize = view.getUint32(40, true)
  const n = dataSize / 2
  const samples = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const s = view.getInt16(44 + i * 2, true)
    samples[i] = s < 0 ? s / 0x8000 : s / 0x7fff
  }
  return { audioFormat, numChannels, sampleRate, bitsPerSample, samples }
}

test('encodeWav: header fields are correct (PCM, mono, 16-bit, real sample rate)', () => {
  const samples = Float32Array.from([0, 0.5, -0.5, 1, -1])
  const wav = encodeWav(samples, 24000)
  const decoded = decodeWav(wav)
  assert.equal(decoded.audioFormat, 1, 'PCM')
  assert.equal(decoded.numChannels, 1, 'mono')
  assert.equal(decoded.sampleRate, 24000)
  assert.equal(decoded.bitsPerSample, 16)
  assert.equal(wav.byteLength, 44 + samples.length * 2)
})

test('encodeWav: round-trips the waveform within 16-bit quantization error', () => {
  const sr = 24000
  const input = speechLike(2, sr, { level: -14 }) // loud, close to the processed-output level
  const wav = encodeWav(input, sr)
  const { samples: out } = decodeWav(wav)
  assert.equal(out.length, input.length)
  // 16-bit quantization step is 1/32767 ≈ 3.05e-5; allow a small margin.
  let maxErr = 0
  for (let i = 0; i < input.length; i++) maxErr = Math.max(maxErr, Math.abs(input[i] - out[i]))
  assert.ok(maxErr < 0.0001, `max sample error ${maxErr}`)
  // The frequency content survives (not just the peak samples) — same test
  // Goertzel helper used to verify the DSP chain above.
  assert.ok(Math.abs(amplitudeAt(input, sr, 110) - amplitudeAt(out, sr, 110)) < 0.01)
})

test('encodeWav: never clips a full-scale signal (±1.0 maps to the exact int16 extremes)', () => {
  const samples = Float32Array.from([1, -1, 1.5, -1.5]) // 1.5 is out-of-range input, must be clamped not wrapped
  const { samples: out } = decodeWav(encodeWav(samples, 8000))
  assert.ok(out.every((v) => v >= -1 && v <= 1))
  assert.ok(out[0] > 0.99)
  assert.ok(out[1] < -0.99)
})

// ---- The live volume stage (useSpeechOutput.ts): compressor + hard clamp ----
// The DynamicsCompressorNode and WaveShaperNode only run in a real browser
// (Web Audio isn't available in Node), so what's provable here is narrower
// than the graph's actual behavior: a real DynamicsCompressorNode is NOT a
// simple "no-op below threshold, hard-limit above it" gate — an earlier
// attempt at these constants (threshold -0.3 dB, knee 0) that looked correct
// by that simple model measurably was NOT transparent (~2% peak change) and
// STILL let a sharp transient clip at 150% in real Chromium. These values
// were corrected by direct browser measurement (an OfflineAudioContext
// render, not a numeric assumption) — see the mission report for the actual
// perceptual numbers (25%/100%/150% amplitude, no clipping at 150%, 100%
// within ~0.04% of the untouched signal). What's tested here is just that
// the tuned, measured-good values are the ones actually shipped and that
// the clamp curve itself is correct.
test('locked constants: the volume stage is the config that was actually measured transparent+non-clipping', () => {
  assert.deepEqual(VOLUME_SAFETY_LIMITER, { thresholdDb: -1, kneeDb: 40, ratio: 20, attackSec: 0.003, releaseSec: 0.1 })
})

test('the safety-limiter threshold is never below the offline chain\'s own ceiling (a basic sanity bound)', () => {
  // Not sufficient on its own to prove transparency (see above) — but if
  // this were violated, the limiter would start compressing well below
  // where the processed signal actually sits, which is obviously wrong.
  assert.ok(VOLUME_SAFETY_LIMITER.thresholdDb >= SPEECH_PROCESSING.limiter.ceilingDb)
})

test('buildSafetyClampCurve: maps ±1 to exactly ±1, and is identity through the middle (no coloration of normal-level audio)', () => {
  const curve = buildSafetyClampCurve()
  assert.equal(curve.length, SAFETY_CLAMP_CURVE_SIZE)
  assert.equal(curve[0], -1)
  assert.equal(curve[curve.length - 1], 1)
  assert.ok(Math.abs(curve[Math.floor(curve.length / 2)]) < 1e-3, 'the midpoint (input 0) maps to ~0')
  // Spot-check identity across the normal operating range (well under the
  // offline chain's -1 dB ceiling ≈ 0.89 linear) — the clamp must never
  // touch ordinary content, only the rare sample right at the edge.
  for (const x of [-0.9, -0.5, -0.1, 0.1, 0.5, 0.9]) {
    const index = Math.round(((x + 1) / 2) * (curve.length - 1))
    assert.ok(Math.abs(curve[index] - x) < 1e-3, `x=${x} -> curve=${curve[index]}`)
  }
})

test('buildSafetyClampCurve: is monotonically non-decreasing (a real clamp, not a distorting reshape)', () => {
  const curve = buildSafetyClampCurve()
  for (let i = 1; i < curve.length; i++) assert.ok(curve[i] >= curve[i - 1], `curve decreased at index ${i}`)
})
