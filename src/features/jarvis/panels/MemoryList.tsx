import type { JarvisMemoryEntry } from '../api'
import { formatRelative } from '../logic/format.ts'
import Icon from '../ui/Icon'

interface MemoryListProps {
  entries: JarvisMemoryEntry[]
  status: 'loading' | 'ready' | 'error'
  errorMessage: string
  now: number
  onForget: (entry: JarvisMemoryEntry) => void
}

// The real stored memory: every fact Jarvis keeps about you, each with a Forget
// action (which asks for confirmation).
export default function MemoryList({ entries, status, errorMessage, now, onForget }: MemoryListProps) {
  if (status === 'loading') return <p className="j-working">MEMORY // RETRIEVING</p>
  if (status === 'error') return <p className="j-error-note">ERROR // {errorMessage || 'Could not load memory.'}</p>
  if (entries.length === 0) {
    return <p className="j-empty-note">MEMORY // EMPTY. Jarvis remembers things you share as you chat.</p>
  }
  return (
    <ul className="j-memory-list">
      {entries.map((entry) => (
        <li key={entry.id} className="j-memory-item">
          <div>
            <p className="j-memory-text">{entry.content}</p>
            <p className="j-memory-meta">{formatRelative(entry.createdAt, now)}</p>
          </div>
          <button type="button" className="j-icon-btn small danger" onClick={() => onForget(entry)} aria-label={`Forget: ${entry.content}`} data-sound="none">
            <Icon name="trash" size={15} />
          </button>
        </li>
      ))}
    </ul>
  )
}
