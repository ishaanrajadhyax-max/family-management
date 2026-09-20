import type { JarvisConversation, JarvisMode, JarvisModeInfo } from './api'

interface ConversationSidebarProps {
  modes: JarvisModeInfo[]
  selectedMode: JarvisMode
  onSelectMode: (mode: JarvisMode) => void
  conversations: JarvisConversation[]
  activeConversationId: string | null
  onSelectConversation: (id: string) => void
  onNewConversation: () => void
}

export default function ConversationSidebar({
  modes,
  selectedMode,
  onSelectMode,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
}: ConversationSidebarProps) {
  return (
    <aside className="jarvis-sidebar">
      <div className="jarvis-sidebar-header">
        <span className="jarvis-logo">JARVIS</span>
      </div>

      <div className="jarvis-mode-picker" role="group" aria-label="Mode for a new conversation">
        {modes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={mode.id === selectedMode ? 'jarvis-mode-btn active' : 'jarvis-mode-btn'}
            onClick={() => onSelectMode(mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <button type="button" className="jarvis-new-btn" onClick={onNewConversation}>
        + New Conversation
      </button>

      <ul className="jarvis-conversation-list">
        {conversations.length === 0 && (
          <li className="jarvis-conversation-empty">No conversations yet — say hello.</li>
        )}
        {conversations.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className={c.id === activeConversationId ? 'jarvis-conversation-item active' : 'jarvis-conversation-item'}
              onClick={() => onSelectConversation(c.id)}
            >
              <span className="jarvis-conversation-title">{c.title || 'New conversation'}</span>
              <span className="jarvis-conversation-mode">{c.mode}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
