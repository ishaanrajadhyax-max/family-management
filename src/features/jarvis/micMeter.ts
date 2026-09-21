// Real microphone level for the Core while Jarvis is listening.
//
// Speech recognition itself never exposes audio levels, so this opens the same
// microphone (permission is already granted for recognition) into an
// AnalyserNode and reports its loudness. It is best-effort: on touch devices
// (where a second microphone stream can break speech recognition) and anywhere
// the browser refuses, it does nothing and the Core falls back to a steady
// "listening" pulse instead of inventing a level.
import { setLevelSource } from './logic/coreStore.ts'

let stream: MediaStream | null = null
let context: AudioContext | null = null
let analyser: AnalyserNode | null = null
let buffer: Uint8Array<ArrayBuffer> | null = null
let starting = false

function readMicLevel(): number | null {
  if (!analyser || !buffer) return null
  analyser.getByteTimeDomainData(buffer)
  let sum = 0
  for (let i = 0; i < buffer.length; i++) {
    const v = (buffer[i] - 128) / 128
    sum += v * v
  }
  const rms = Math.sqrt(sum / buffer.length)
  return Math.min(1, rms * 5) // typical speech RMS is ~0.05-0.2
}

export async function startMicMeter(): Promise<void> {
  if (stream || starting) return
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return
  if (!window.matchMedia('(pointer: fine)').matches) return // touch device: skip, use the pulse
  starting = true
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true })
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) {
      s.getTracks().forEach((t) => t.stop())
      return
    }
    stream = s
    context = new Ctor()
    analyser = context.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.6
    context.createMediaStreamSource(s).connect(analyser) // never connected to the speakers
    buffer = new Uint8Array(new ArrayBuffer(analyser.fftSize))
    setLevelSource('listening', readMicLevel)
  } catch {
    stopMicMeter()
  } finally {
    starting = false
  }
}

export function stopMicMeter() {
  setLevelSource('listening', null)
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  analyser = null
  buffer = null
  if (context) void context.close().catch(() => undefined)
  context = null
}
