import { useEffect, useRef } from 'react'
import type { JarvisMessage } from '../api'
import { formatMessageTime } from '../utils'
import { useCoreState } from '../hooks/useCoreState'
import MessageContent from './MessageContent'
import Icon from '../ui/Icon'

interface ConversationStreamProps {
  messages: JarvisMessage[]
  loading: boolean
  revealMessageId: string | null // the reply that just arrived live
  canSpeak: boolean
  onReplay: (text: string) => void
  emptyHint: string
}

// The console: YOU // and JARVIS // entries, separated by thin lines, with
// readable Markdown. While Jarvis works, the line at the end mirrors the CORE's
// state (it reads the same store), so there is one source of truth and no
// separate typing indicator.
export default function ConversationStream({ messages, loading, revealMessageId, canSpeak, onReplay, emptyHint }: ConversationStreamProps) {
  const { state, detail } = useCoreState()
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, state])

  if (messages.length === 0 && !loading) {
    return (
      <div className="j-stream j-stream-empty">
        <p className="j-empty-title">
          COMMAND <span className="j-slashes">//</span> READY
        </p>
        <p className="j-empty-hint">{emptyHint}</p>
        {state === 'thinking' && <p className="j-stream-working">JARVIS // {detail || 'THINKING'}</p>}
      </div>
    )
  }

  return (
    <div className="j-stream" role="log" aria-live="polite" aria-relevant="additions">
      {loading && messages.length === 0 && <p className="j-stream-working">MEMORY // RETRIEVING CONVERSATION</p>}
      {messages.map((m) => (
        <article key={m.id} className={`j-msg ${m.role}`}>
          <header className="j-msg-head">
            <span className="j-msg-who">
              {m.role === 'user' ? 'YOU' : 'JARVIS'} <span className="j-slashes">//</span>
            </span>
            <time className="j-msg-time" dateTime={m.createdAt}>
              {formatMessageTime(m.createdAt)}
            </time>
            {m.role === 'assistant' && canSpeak && (
              <button type="button" className="j-icon-btn small" onClick={() => onReplay(m.content)} aria-label="Read this reply aloud" data-sound="none">
                <Icon name="replay" size={14} />
              </button>
            )}
          </header>
          {m.role === 'user' ? <p className="j-msg-user-text">{m.content}</p> : <MessageContent content={m.content} reveal={m.id === revealMessageId} />}
        </article>
      ))}
      {state === 'thinking' && (
        <p className="j-stream-working" aria-live="polite">
          JARVIS <span className="j-slashes">//</span> {detail || 'THINKING'}
          <span className="j-scanbar" aria-hidden="true" />
        </p>
      )}
      <div ref={endRef} />
    </div>
  )
}
