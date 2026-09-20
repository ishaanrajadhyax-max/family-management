import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import type { JarvisConversation, JarvisMessage } from './api'
import { formatMessageTime } from './utils'
import { useVoiceCapture } from './useVoiceCapture'
import { useSpeechOutput } from './useSpeechOutput'

interface ChatViewProps {
  conversation: JarvisConversation | null
  modeLabel?: string
  messages: JarvisMessage[]
  messagesLoading: boolean
  onSend: (content: string) => void
  sending: boolean
  error: string
  speakEnabled: boolean
  onToggleSpeak: () => void
  onOpenMemory: () => void
}

export default function ChatView({
  conversation,
  modeLabel,
  messages,
  messagesLoading,
  onSend,
  sending,
  error,
  speakEnabled,
  onToggleSpeak,
  onOpenMemory,
}: ChatViewProps) {
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const voiceCapture = useVoiceCapture()
  const speechOutput = useSpeechOutput()

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const content = draft.trim()
    if (!content || sending) return
    setDraft('')
    onSend(content)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  function handleMicClick() {
    if (voiceCapture.isListening) {
      voiceCapture.stop()
      return
    }
    voiceCapture.start((transcript) => {
      setDraft((prev) => (prev ? `${prev} ${transcript}` : transcript))
    })
  }

  return (
    <div className="jarvis-chat">
      <div className="jarvis-chat-header">
        <span className="jarvis-chat-title">{conversation?.title || 'New conversation'}</span>
        <div className="jarvis-chat-header-actions">
          {modeLabel && <span className="jarvis-chat-mode">{modeLabel}</span>}
          {speechOutput.isSupported && (
            <button
              type="button"
              className={speakEnabled ? 'jarvis-icon-btn active' : 'jarvis-icon-btn'}
              onClick={onToggleSpeak}
              title={speakEnabled ? 'Spoken replies on' : 'Spoken replies off'}
              aria-pressed={speakEnabled}
            >
              {speakEnabled ? '🔊' : '🔇'}
            </button>
          )}
          <button type="button" className="jarvis-icon-btn" onClick={onOpenMemory} title="What Jarvis remembers">
            🧠
          </button>
        </div>
      </div>

      <div className="jarvis-messages">
        {messages.length === 0 && !messagesLoading && (
          <div className="jarvis-welcome">
            <p className="jarvis-welcome-title">What can I help with?</p>
            <p className="jarvis-welcome-hint">Pick a mode on the left, or just start typing.</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'jarvis-message user' : 'jarvis-message assistant'}>
            <div className="jarvis-message-bubble">{m.content}</div>
            <div className="jarvis-message-meta">
              <span className="jarvis-message-time">{formatMessageTime(m.createdAt)}</span>
              {m.role === 'assistant' && speechOutput.isSupported && (
                <button
                  type="button"
                  className="jarvis-message-replay"
                  onClick={() => speechOutput.speak(m.content)}
                  aria-label="Read this reply aloud"
                >
                  🔊
                </button>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="jarvis-message assistant">
            <div className="jarvis-message-bubble jarvis-message-typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {(error || voiceCapture.error) && <p className="jarvis-error">{error || voiceCapture.error}</p>}

      <form className="jarvis-composer" onSubmit={handleSubmit}>
        {voiceCapture.isSupported && (
          <button
            type="button"
            className={voiceCapture.isListening ? 'jarvis-mic-btn listening' : 'jarvis-mic-btn'}
            onClick={handleMicClick}
            aria-label={voiceCapture.isListening ? 'Stop listening' : 'Speak your message'}
            aria-pressed={voiceCapture.isListening}
          >
            🎤
          </button>
        )}
        <textarea
          className="jarvis-composer-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={voiceCapture.isListening ? 'Listening…' : 'Message Jarvis…'}
          rows={1}
          disabled={sending}
        />
        <button type="submit" className="jarvis-composer-send" disabled={sending || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}
