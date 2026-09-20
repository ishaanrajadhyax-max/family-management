import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import type { JarvisConversation, JarvisMessage } from './api'
import { formatMessageTime } from './utils'

interface ChatViewProps {
  conversation: JarvisConversation | null
  modeLabel?: string
  messages: JarvisMessage[]
  messagesLoading: boolean
  onSend: (content: string) => void
  sending: boolean
  error: string
}

export default function ChatView({
  conversation,
  modeLabel,
  messages,
  messagesLoading,
  onSend,
  sending,
  error,
}: ChatViewProps) {
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

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

  return (
    <div className="jarvis-chat">
      <div className="jarvis-chat-header">
        <span className="jarvis-chat-title">{conversation?.title || 'New conversation'}</span>
        {modeLabel && <span className="jarvis-chat-mode">{modeLabel}</span>}
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
            <span className="jarvis-message-time">{formatMessageTime(m.createdAt)}</span>
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

      {error && <p className="jarvis-error">{error}</p>}

      <form className="jarvis-composer" onSubmit={handleSubmit}>
        <textarea
          className="jarvis-composer-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message Jarvis…"
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
