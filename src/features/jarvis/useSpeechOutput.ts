import { fetchSpeech, ServerSpeechUnavailable } from './api'
import { processSpeech } from './speechDsp'
import { setCoreSignal, setLevelSource } from './logic/coreStore.ts'
import { buildEnvelope, envelopeAt } from './logic/envelope.ts'

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
let processedSource: AudioBufferSourceNode | null = null
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
let playback: { ctx: AudioContext; startedAt: number; envelope: Float32Array } | null = null
setLevelSource('speaking', () => (playback ? envelopeAt(playback.envelope, playback.ctx.currentTime - playback.startedAt) : null))

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
  setCoreSignal('speaking', false)
  if (processedSource) {
    processedSource.onended = null
    try {
      processedSource.stop()
    } catch {
      // already stopped
    }
    processedSource.disconnect()
    processedSource = null
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
  const buffer = ctx.createBuffer(1, samples.length, decoded.sampleRate)
  buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  source.onended = () => {
    if (mine === generation) releaseAudio()
  }
  processedSource = source
  source.start()
  playback = { ctx, startedAt: ctx.currentTime, envelope }
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
