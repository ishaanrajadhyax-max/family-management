import { useRef, useState } from 'react'

// The Web Speech API's SpeechRecognition isn't in TypeScript's standard
// DOM lib (it's still a non-standard/vendor API) — this is just enough of
// its shape to use it safely, not a full type definition.
interface SpeechRecognitionResultLike {
  [index: number]: { [index: number]: { transcript: string } }
}
interface SpeechRecognitionEventLike {
  results: SpeechRecognitionResultLike
}
interface SpeechRecognitionErrorEventLike {
  error: string
}
interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition as SpeechRecognitionConstructor) ?? (w.webkitSpeechRecognition as SpeechRecognitionConstructor) ?? null
}

// This is the turn-based capture piece of Jarvis's voice pipeline: record
// -> transcribe -> hand back the text, one exchange at a time. Kept
// behind this one hook (rather than sprinkled into ChatView) so a later
// swap to a real-time/streaming transcription service only means
// rewriting this file's internals — everything downstream (the chat
// pipeline, memory, replies) is unaffected either way.
export function useVoiceCapture() {
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState('')
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const isSupported = getSpeechRecognitionConstructor() != null

  function start(onResult: (transcript: string) => void) {
    const Ctor = getSpeechRecognitionConstructor()
    if (!Ctor) {
      setError('Voice input is not supported in this browser.')
      return
    }
    setError('')
    const recognition = new Ctor()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? ''
      if (transcript) onResult(transcript)
    }
    recognition.onerror = (event) => {
      setError(event.error === 'not-allowed' ? 'Microphone access was denied.' : 'Voice input failed.')
      setIsListening(false)
    }
    recognition.onend = () => setIsListening(false)
    recognitionRef.current = recognition
    setIsListening(true)
    recognition.start()
  }

  function stop() {
    recognitionRef.current?.stop()
    setIsListening(false)
  }

  return { isSupported, isListening, error, start, stop }
}
