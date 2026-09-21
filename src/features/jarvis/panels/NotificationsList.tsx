import { formatRelative } from '../logic/format.ts'
import type { NotificationEntry } from '../ui/toastContext'

// This session's real notifications (memory saved, errors, mode changes...).
export default function NotificationsList({ entries, now }: { entries: NotificationEntry[]; now: number }) {
  if (entries.length === 0) return <p className="j-empty-note">NOTIFICATIONS // NONE THIS SESSION</p>
  return (
    <ul className="j-notes">
      {entries.map((e) => (
        <li key={e.id} className={`j-note tone-${e.tone}`}>
          <p>
            <span className="j-note-label">
              {e.label} <span className="j-slashes">//</span>
            </span>{' '}
            {e.text}
          </p>
          <time>{formatRelative(new Date(e.at).toISOString(), now)}</time>
        </li>
      ))}
    </ul>
  )
}
