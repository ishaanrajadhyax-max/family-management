// Turns a reply's real audio samples into a loudness envelope (one value per
// 20 ms, 0..1) that the Core reads while Jarvis speaks, so its rings follow
// the actual speech rather than a canned animation. Pure functions.

export const ENVELOPE_WINDOW_SEC = 0.02

export function buildEnvelope(samples: Float32Array, sampleRate: number): Float32Array {
  const win = Math.max(1, Math.round(sampleRate * ENVELOPE_WINDOW_SEC))
  const count = Math.ceil(samples.length / win)
  const env = new Float32Array(count)
  let max = 0
  for (let w = 0; w < count; w++) {
    const start = w * win
    const end = Math.min(samples.length, start + win)
    let sum = 0
    for (let i = start; i < end; i++) sum += samples[i] * samples[i]
    const rms = Math.sqrt(sum / Math.max(1, end - start))
    env[w] = rms
    if (rms > max) max = rms
  }
  if (max > 0) {
    // sqrt: closer to how loudness is perceived, so quiet syllables still move the core.
    for (let w = 0; w < count; w++) env[w] = Math.min(1, Math.sqrt(env[w] / max))
  }
  return env
}

export function envelopeAt(envelope: Float32Array, seconds: number): number {
  const index = Math.floor(seconds / ENVELOPE_WINDOW_SEC)
  return index < 0 || index >= envelope.length ? 0 : envelope[index]
}
