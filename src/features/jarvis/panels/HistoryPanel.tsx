import type { JarvisConversation } from '../api'
import { formatRelative } from '../logic/format.ts'
import Icon from '../ui/Icon'

interface HistoryListProps {
  conversations: JarvisConversation[]
  activeId: string | null
  now: number
  onSelect: (id: string) => void
  onNew: () => void
}

// The real list of conversations, most recently active first. Used in the left
// column on desktop and inside the History drawer on smaller screens.
export default function HistoryList({ conversations, activeId, now, onSelect, onNew }: HistoryListProps) {
  return (
    <div className="j-history">
      <button type="button" className="j-btn primary block" onClick={onNew}>
        <Icon name="plus" size={16} /> NEW CONVERSATION
      </button>
      {conversations.length === 0 ? (
        <p className="j-empty-note">No conversations yet. Say hello.</p>
      ) : (
        <ul className="j-history-list">
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={c.id === activeId ? 'j-history-item active' : 'j-history-item'}
                onClick={() => onSelect(c.id)}
                aria-current={c.id === activeId ? 'true' : undefined}
              >
                <span className="j-history-title">{c.title || 'New conversation'}</span>
                <span className="j-history-meta">
                  <span className="j-badge">{c.mode.toUpperCase()}</span>
                  <span>{formatRelative(c.updatedAt, now)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
