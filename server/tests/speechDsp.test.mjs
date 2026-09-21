// Loudness/clarity processing for spoken replies (src/features/jarvis/speechDsp.ts).
// Synthetic signals only — no voice audio or personal content. The module is pure
// arithmetic on samples, so it runs here exactly as it does in the browser.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { processSpeech, activeRmsDb, peakDb, SPEECH_PROCESSING } from '../../src/features/jarvis/speechDsp.ts'

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
