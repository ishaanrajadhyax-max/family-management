import { useEffect, useRef, useState } from 'react'
import type { JarvisConversation, JarvisMessage } from './api'
import { useVoiceCapture } from './useVoiceCapture'
import { useSpeechOutput } from './useSpeechOutput'

interface VoiceConversationViewProps {
  conversation: JarvisConversation | null
  modeLabel?: string
  messages: JarvisMessage[]
  onSend: (content: string) => void
  sending: boolean
  error: string
  onExit: () => void
}

// A phone-call-style view: tap to talk, see a running transcript, hear
// Jarvis reply. Turn-based by design (tap mic -> speak -> Jarvis answers
// and speaks back -> tap again for the next turn) rather than a
// continuously-open microphone — see useVoiceCapture.ts for why that
// boundary matters for a later real-time swap. Reuses the exact same
// conversation/message state and send pipeline as ChatView; this is just
// a different way of looking at the same conversation.
export default function VoiceConversationView({
  conversation,
  modeLabel,
  messages,
  onSend,
  sending,
  error,
  onExit,
}: VoiceConversationViewProps) {
  const voiceCapture = useVoiceCapture()
  const speechOutput = useSpeechOutput()
  const [liveTranscript, setLiveTranscript] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const lastSpokenMessageId = useRef<string | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, liveTranscript])

  // Speak each new assistant reply exactly once, as it arrives — this
  // view is voice-first, so spoken replies are always on here regardless
  // of ChatView's separate speak toggle.
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (last && last.role === 'assistant' && last.id !== lastSpokenMessageId.current) {
      lastSpokenMessageId.current = last.id
      speechOutput.speak(last.content)
    }
    // speechOutput.speak is stable across renders (see useSpeechOutput);
    // only re-run when the message list itself actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  function handleMicClick() {
    if (voiceCapture.isListening) {
      voiceCapture.stop()
      return
    }
    speechOutput.stop()
    setLiveTranscript('')
    voiceCapture.start((transcript) => {
      setLiveTranscript(transcript)
      onSend(transcript)
    })
  }

  const micState = voiceCapture.isListening ? 'listening' : sending ? 'thinking' : 'idle'

  return (
    <div className="jarvis-voice">
      <div className="jarvis-voice-header">
        <button type="button" className="jarvis-icon-btn" onClick={onExit} aria-label="Back to chat">
          ←
        </button>
        <span className="jarvis-chat-title">{conversation?.title || 'Voice conversation'}</span>
        {modeLabel && <span className="jarvis-chat-mode">{modeLabel}</span>}
      </div>

      <div className="jarvis-voice-transcript">
        {messages.length === 0 && !liveTranscript && (
          <p className="jarvis-welcome-hint">Tap the microphone and start talking.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'jarvis-voice-turn user' : 'jarvis-voice-turn assistant'}>
            <span className="jarvis-voice-turn-label">{m.role === 'user' ? 'You' : 'Jarvis'}</span>
            <p>{m.content}</p>
          </div>
        ))}
        {voiceCapture.isListening && liveTranscript && (
          <div className="jarvis-voice-turn user live">
            <span className="jarvis-voice-turn-label">You</span>
            <p>{liveTranscript}</p>
          </div>
        )}
        {sending && (
          <div className="jarvis-voice-turn assistant">
            <span className="jarvis-voice-turn-label">Jarvis</span>
            <p className="jarvis-voice-thinking">…</p>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {(error || voiceCapture.error) && <p className="jarvis-error">{error || voiceCapture.error}</p>}
      {!voiceCapture.isSupported && (
        <p className="jarvis-error">Voice input isn't supported in this browser.</p>
      )}

      <div className="jarvis-voice-controls">
        <button
          type="button"
          className={`jarvis-voice-mic ${micState}`}
          onClick={handleMicClick}
          disabled={!voiceCapture.isSupported || sending}
          aria-label={voiceCapture.isListening ? 'Stop listening' : 'Start talking'}
        >
          🎤
        </button>
        <span className="jarvis-voice-status">
          {micState === 'listening' ? 'Listening…' : micState === 'thinking' ? 'Jarvis is thinking…' : 'Tap to talk'}
        </span>
      </div>
    </div>
  )
}
