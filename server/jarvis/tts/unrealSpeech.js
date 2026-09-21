// Server-side client for Unreal Speech's /stream endpoint (up to 1000
// characters, audio back in ~0.3s — a fit for short conversational replies).
// The API key is read from the environment here and only ever sent to
// Unreal Speech; it never reaches the browser or any response.
//
// Contract (docs.unrealspeech.com/reference/stream): POST {base}/stream,
// header `Authorization: Bearer <key>`, JSON body { Text, VoiceId, Bitrate,
// Speed, Pitch, Codec, Temperature }, response is MP3 audio.
// Voices Unreal Speech documents for /stream. Anything else falls back to Will.
export const SUPPORTED_VOICES = ['Scarlett', 'Dan', 'Liv', 'Will', 'Amy']
export const DEFAULT_VOICE = 'Will'

const DEFAULT_BASE_URL = 'https://api.v7.unrealspeech.com'
const TIMEOUT_MS = 10_000

// Config (all env, all server-side):
//   TTS_PROVIDER            "unreal" (default) or anything else (e.g. "browser")
//                           to switch server voice off and use the browser voice
//   UNREAL_SPEECH_API_KEY   required for the server voice
//   UNREAL_SPEECH_VOICE     default "Will"
export function ttsProvider(env = process.env) {
  return (env.TTS_PROVIDER || 'unreal').trim().toLowerCase()
}

export function isUnrealConfigured(env = process.env) {
  return ttsProvider(env) === 'unreal' && Boolean(env.UNREAL_SPEECH_API_KEY?.trim())
}

export function resolveVoice(env = process.env) {
  const wanted = (env.UNREAL_SPEECH_VOICE || DEFAULT_VOICE).trim()
  return SUPPORTED_VOICES.find((v) => v.toLowerCase() === wanted.toLowerCase()) ?? DEFAULT_VOICE
}

// Speed (-1..1) and Pitch (0.5..1.5) shape the "calm, slightly deep" delivery.
// They can't be auditioned from code, so they're env-tunable without a
// redeploy of code: set UNREAL_SPEECH_SPEED / UNREAL_SPEECH_PITCH.
function voiceSettings(env) {
  const clamp = (v, lo, hi, fallback) => {
    const n = Number(v)
    return Number.isFinite(n) ? String(Math.min(hi, Math.max(lo, n))) : fallback
  }
  return {
    Speed: clamp(env.UNREAL_SPEECH_SPEED, -1, 1, '-0.1'),
    Pitch: clamp(env.UNREAL_SPEECH_PITCH, 0.5, 1.5, '0.95'),
  }
}

// MP3 starts with an ID3 tag or an MPEG frame sync (0xFFEx/0xFFFx). Unreal's
// docs label the response text/plain, so the bytes — not the header — decide
// whether this is audio, and a JSON error body is never played as sound.
export function looksLikeMp3(bytes) {
  if (bytes.length < 4) return false
  const id3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33
  const frame = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0
  return id3 || frame
}

// Resolves { ok: true, audio: Buffer } or { ok: false, status, code }, where
// code is one of: unconfigured | auth | quota | upstream | invalid_audio | network.
// Never throws, and never includes any response body from the provider.
export async function synthesize(text, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (!isUnrealConfigured(env)) return { ok: false, status: 503, code: 'unconfigured' }

  let response
  try {
    response = await fetchImpl(`${env.UNREAL_SPEECH_BASE_URL || DEFAULT_BASE_URL}/stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.UNREAL_SPEECH_API_KEY.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Text: text,
        VoiceId: resolveVoice(env),
        // Variant B. 320k is the highest Unreal accepts; at its 22.05 kHz output it
        // encodes at 160 kbps, so this is simply "as high as it goes".
        Bitrate: '320k',
        Codec: 'libmp3lame',
        Temperature: 0.25,
        ...voiceSettings(env),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    return { ok: false, status: 502, code: 'network' }
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) return { ok: false, status: response.status, code: 'auth' }
    if (response.status === 402 || response.status === 429) return { ok: false, status: response.status, code: 'quota' }
    return { ok: false, status: response.status, code: 'upstream' }
  }

  const audio = Buffer.from(await response.arrayBuffer())
  if (!looksLikeMp3(audio)) return { ok: false, status: 502, code: 'invalid_audio' }
  return { ok: true, audio }
}
