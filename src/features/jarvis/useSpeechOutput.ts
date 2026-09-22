import { fetchSpeech, ServerSpeechUnavailable } from './api'
import { buildSafetyClampCurve, encodeWav, processSpeech, VOLUME_SAFETY_LIMITER } from './speechDsp'
import { setCoreSignal, setLevelSource } from './logic/coreStore.ts'
import { buildEnvelope, envelopeAt } from './logic/envelope.ts'
import { getVoicePlaybackSettings, subscribeVoicePlaybackSettings, volumeToNativeRange } from './logic/voiceSettings.ts'

// The "speak Jarvis's replies aloud" piece of the voice pipeline — the
// mirror image of useVoiceCapture.ts. Same interface as before
// ({ isSupported, speak, stop }), so nothing that calls it changed.
//
// Two voices, tried in order:
//   1. The server voice — Unreal Speech's "Will", fetched from our own
//      /api/jarvis/speech endpoint (the API key never leaves the server).
//      The MP3 is decoded and run through speechDsp.ts (EQ, compression,
//      loudness, limiter) before playing, because the raw audio is quiet and
//      soft. If that processing can't run for any reason, the unprocessed MP3
//      is played instead.
//   2. The browser's built-in speechSynthesis — used whenever the server
//      voice can't be: not configured, a spend limit reached, the provider
//      erroring or timing out, the request failing, or the browser refusing
//      to play the audio (autoplay policy, or a Content-Security-Policy that
//      doesn't allow blob: media — see media-src in server/server.js). The
//      user just hears the browser voice.
//
// State lives at module level, not per hook instance: ChatView, the voice
// view and JarvisApp each call this hook, and a stop() from any of them
// must silence whichever voice is actually playing.

let audio: HTMLAudioElement | null = null
let audioUrl: string | null = null
// The processed reply is played through an HTMLAudioElement (not a plain
// AudioBufferSourceNode) specifically so speed changes go through
// HTMLMediaElement.playbackRate, the only playback mechanism here that
// time-stretches instead of resampling — it changes pace without changing
// Will's pitch. Volume then rejoins the Web Audio graph via
// createMediaElementSource -> gain -> safety limiter, which is what lets
// volume go above 100% without clipping. These three only ever describe the
// PROCESSED path; the raw-MP3 and browser-speech fallbacks (below) have no
// Web Audio graph and don't use them.
let mediaSource: MediaElementAudioSourceNode | null = null
let gainNode: GainNode | null = null
let safetyLimiter: DynamicsCompressorNode | null = null
let safetyClamp: WaveShaperNode | null = null
let usingProcessedGraph = false
let audioContext: AudioContext | null = null
let pending: AbortController | null = null
let generation = 0
// Set once the server says it has no key, so we don't ask again this session.
let serverVoiceUnconfigured = false

const browserSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

// ---- Observability for the interface (does not affect what is played) ----
// Which voice last spoke, for the status strip and Settings.
export type VoiceEngine = 'unreal' | 'unreal-raw' | 'browser'
let voiceEngine: VoiceEngine | null = null
const engineListeners = new Set<() => void>()
function setVoiceEngine(next: VoiceEngine) {
  if (voiceEngine === next) return
  voiceEngine = next
  engineListeners.forEach((l) => l())
}
export function getVoiceEngine(): VoiceEngine | null {
  return voiceEngine
}
export function subscribeVoiceEngine(listener: () => void): () => void {
  engineListeners.add(listener)
  return () => {
    engineListeners.delete(listener)
  }
}

// The processed reply currently playing, so the Core can follow its real loudness.
// el.currentTime (not wall-clock elapsed time) because it's the position
// within the media's OWN timeline — the envelope was built from the original,
// un-stretched samples, and currentTime tracks that correctly regardless of
// what playbackRate (speed) is currently set to.
let playback: { el: HTMLAudioElement; envelope: Float32Array } | null = null
setLevelSource('speaking', () => (playback ? envelopeAt(playback.envelope, playback.el.currentTime) : null))

// Applies a speed/volume change to whatever is playing right now, live —
// dragging the Settings sliders during an active reply takes effect
// immediately, not just on the next one.
subscribeVoicePlaybackSettings(() => {
  const { speed, volume } = getVoicePlaybackSettings()
  if (audio) audio.playbackRate = speed
  if (usingProcessedGraph && gainNode) {
    gainNode.gain.value = volume / 100
  } else if (audio && !usingProcessedGraph) {
    audio.volume = volumeToNativeRange(volume)
  }
})

// Bumped whenever a browser utterance starts or is cancelled, so a late "ended"
// event from an old utterance can't clear the state of a newer one.
let utteranceToken = 0

// One shared AudioContext, created lazily. Browsers only let it start after
// a user gesture, so it's unlocked on the first tap/keypress anywhere (the
// user always taps something before Jarvis speaks).
function getAudioContext(): AudioContext | null {
  if (audioContext) return audioContext
  const Ctor =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
  if (!Ctor) return null
  audioContext = new Ctor()
  return audioContext
}

if (typeof document !== 'undefined') {
  const unlock = () => {
    const ctx = getAudioContext()
    if (ctx && ctx.state === 'suspended') void ctx.resume()
  }
  document.addEventListener('pointerdown', unlock, { capture: true })
  document.addEventListener('keydown', unlock, { capture: true })
}

// Mirrors the server's cleaning (server/jarvis/tts/speechText.js) — but only
// this fallback path needs it here, since the server voice cleans its own
// input. Removes Markdown, tables and emoji so the browser voice doesn't
// read symbols out.
function toSpeakableText(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, ' ')
    .replace(/^\s*\|(.*)\|\s*$/gm, (_m, row: string) =>
      row
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean)
        .join(', '),
    )
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\bhttps?:\/\/\S+/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*([-*+]|\d+[.)])\s+/gm, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/[*_~#|]+/g, ' ')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function releaseAudio() {
  playback = null
  usingProcessedGraph = false
  setCoreSignal('speaking', false)
  if (mediaSource) {
    mediaSource.disconnect()
    mediaSource = null
  }
  if (gainNode) {
    gainNode.disconnect()
    gainNode = null
  }
  if (safetyLimiter) {
    safetyLimiter.disconnect()
    safetyLimiter = null
  }
  if (safetyClamp) {
    safetyClamp.disconnect()
    safetyClamp = null
  }
  if (audio) {
    audio.onended = null
    audio.onerror = null
    audio.pause()
    audio = null
  }
  // The audio only ever exists as an in-memory blob URL; freeing it here
  // means nothing is kept once playback ends or is cancelled.
  if (audioUrl) {
    URL.revokeObjectURL(audioUrl)
    audioUrl = null
  }
}

function speakWithBrowser(text: string) {
  if (!browserSupported || !text) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  const { speed, volume } = getVoicePlaybackSettings()
  utterance.rate = speed // 0.5..1.6 fits comfortably inside the native 0.1..10 range
  utterance.volume = volumeToNativeRange(volume) // native ceiling is 100%; no Web Audio graph here to boost past it
  const token = ++utteranceToken
  const done = () => {
    if (token === utteranceToken) setCoreSignal('speaking', false)
  }
  utterance.onend = done
  utterance.onerror = done
  setVoiceEngine('browser')
  setCoreSignal('preparing', false)
  setCoreSignal('speaking', true)
  window.speechSynthesis.speak(utterance)
}

function stopAll() {
  generation += 1
  utteranceToken += 1
  setCoreSignal('preparing', false)
  pending?.abort()
  pending = null
  releaseAudio()
  if (browserSupported) window.speechSynthesis.cancel()
}

// Decodes the MP3, runs it through the loudness/clarity chain, and plays the
// result. Throws if any step can't be done, so the caller can fall back.
//
// Playback graph: <audio> (WAV of the processed samples, playbackRate = speed,
// preservesPitch = true) -> MediaElementAudioSourceNode -> GainNode (volume,
// 0..150%) -> DynamicsCompressorNode (loudness, tuned to be transparent at
// gain <= 1.0 — see VOLUME_SAFETY_LIMITER in speechDsp.ts) -> WaveShaperNode
// (a hard [-1,1] clamp — the absolute, measured-not-assumed guarantee that
// nothing this graph ever plays can clip, even a sharp transient the
// compressor's finite attack time lets slip through) -> destination.
async function playProcessed(blob: Blob, mine: number) {
  const ctx = getAudioContext()
  if (!ctx) throw new Error('Web Audio unavailable')
  if (ctx.state !== 'running') {
    await Promise.race([ctx.resume(), new Promise((resolve) => setTimeout(resolve, 500))])
    // resume() changes the state, which TypeScript can't see from here.
    if ((ctx.state as AudioContextState) !== 'running') throw new Error('AudioContext is locked')
  }
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
  if (mine !== generation) return
  const { samples } = processSpeech(decoded.getChannelData(0), decoded.sampleRate)
  const envelope = buildEnvelope(samples, decoded.sampleRate)

  const wav = encodeWav(samples, decoded.sampleRate)
  const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }))
  audioUrl = url
  const el = new Audio(url)
  el.preservesPitch = true
  el.playbackRate = getVoicePlaybackSettings().speed
  audio = el

  const source = ctx.createMediaElementSource(el)
  const gain = ctx.createGain()
  gain.gain.value = getVoicePlaybackSettings().volume / 100
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = VOLUME_SAFETY_LIMITER.thresholdDb
  limiter.knee.value = VOLUME_SAFETY_LIMITER.kneeDb
  limiter.ratio.value = VOLUME_SAFETY_LIMITER.ratio
  limiter.attack.value = VOLUME_SAFETY_LIMITER.attackSec
  limiter.release.value = VOLUME_SAFETY_LIMITER.releaseSec
  const clamp = ctx.createWaveShaper()
  clamp.curve = buildSafetyClampCurve() as Float32Array<ArrayBuffer>
  clamp.oversample = 'none' // oversampling's reconstruction filter rings at this curve's sharp corner at ±1 — measured to reintroduce the exact overshoot this node exists to remove
  source.connect(gain).connect(limiter).connect(clamp).connect(ctx.destination)
  mediaSource = source
  gainNode = gain
  safetyLimiter = limiter
  safetyClamp = clamp
  usingProcessedGraph = true

  el.onended = () => {
    if (mine === generation) releaseAudio()
  }
  el.onerror = () => {
    if (mine === generation) releaseAudio()
  }
  await el.play()
  // A newer speak() may have superseded this one while play() was pending
  // (autoplay negotiation can be slow) — it already called releaseAudio(),
  // which paused/disconnected this call's own el/source/gain/limiter (they
  // were the current module state at that point). Don't let this stale
  // call's resolution overwrite whatever the newer call set up.
  if (mine !== generation) return
  playback = { el, envelope }
  setVoiceEngine('unreal')
  setCoreSignal('preparing', false)
  setCoreSignal('speaking', true)
}

async function speak(text: string) {
  if (!text.trim()) return
  // Cancel whatever's currently playing (or being fetched) so replies don't
  // overlap or queue up if the user sends messages faster than Jarvis talks.
  stopAll()
  const mine = generation
  const fallbackText = toSpeakableText(text)

  if (serverVoiceUnconfigured) {
    speakWithBrowser(fallbackText)
    return
  }

  const controller = new AbortController()
  pending = controller
  setCoreSignal('preparing', true)
  try {
    const blob = await fetchSpeech(text, controller.signal)
    if (mine !== generation) return // superseded or stopped while fetching
    // Preferred: processed for loudness and clarity. If that can't run
    // (no Web Audio, decode failure, context still locked), play the raw MP3.
    try {
      await playProcessed(blob, mine)
      return
    } catch {
      if (mine !== generation) return
      releaseAudio()
    }
    audioUrl = URL.createObjectURL(blob)
    const el = new Audio(audioUrl)
    el.preservesPitch = true
    el.playbackRate = getVoicePlaybackSettings().speed
    // No Web Audio graph on this path (that's exactly why we're here — the
    // processed path just failed) — native .volume is the only lever
    // available, so it's capped at its own 0..100% ceiling.
    el.volume = volumeToNativeRange(getVoicePlaybackSettings().volume)
    audio = el
    el.onended = () => {
      if (mine === generation) releaseAudio()
    }
    el.onerror = () => {
      if (mine !== generation) return
      releaseAudio()
      speakWithBrowser(fallbackText)
    }
    // Rejects if the browser blocks autoplay — handled below like any failure.
    await el.play()
    if (mine !== generation) return // superseded while play() was pending — see the same guard in playProcessed
    setVoiceEngine('unreal-raw')
    setCoreSignal('preparing', false)
    setCoreSignal('speaking', true)
  } catch (err) {
    if (mine !== generation) return
    if (err instanceof ServerSpeechUnavailable && err.unconfigured) serverVoiceUnconfigured = true
    releaseAudio()
    speakWithBrowser(fallbackText)
  } finally {
    if (pending === controller) pending = null
    if (mine === generation) setCoreSignal('preparing', false)
  }
}

export function useSpeechOutput() {
  // Either voice counts: the server voice needs no browser support beyond
  // audio playback, and the fallback needs speechSynthesis.
  const isSupported = browserSupported || (typeof window !== 'undefined' && typeof Audio !== 'undefined')
  return { isSupported, speak, stop: stopAll }
}
