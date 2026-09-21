import Icon from '../ui/Icon'
import type { IconName } from '../ui/Icon'

interface QuickAction {
  icon: IconName
  label: string
  onClick: () => void
  disabled?: boolean
}

// Shortcuts to things that really exist: a fresh conversation, the voice
// conversation, saved memory, and Family Management.
export default function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <ul className="j-quick">
      {actions.map((a) => (
        <li key={a.label}>
          <button type="button" className="j-quick-item" onClick={a.onClick} disabled={a.disabled}>
            <Icon name={a.icon} size={17} />
            <span>{a.label}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
