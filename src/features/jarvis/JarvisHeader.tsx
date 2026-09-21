import Icon from './ui/Icon'
import type { IconName } from './ui/Icon'

export type HeaderTarget = 'chat' | 'voice' | 'intelligence' | 'memory' | 'history' | 'family'

interface JarvisHeaderProps {
  view: 'chat' | 'voice'
  activePanel: string | null
  unseenNotifications: number
  userName: string
  onNavigate: (target: HeaderTarget) => void
  onOpenNotifications: () => void
  onOpenSettings: () => void
}

const NAV: { target: HeaderTarget; label: string; icon: IconName; mobileOnly?: boolean }[] = [
  { target: 'chat', label: 'CHAT', icon: 'chat' },
  { target: 'voice', label: 'VOICE', icon: 'voice' },
  { target: 'history', label: 'HISTORY', icon: 'history', mobileOnly: true },
  { target: 'intelligence', label: 'INTELLIGENCE', icon: 'intelligence' },
  { target: 'memory', label: 'MEMORY', icon: 'memory' },
  { target: 'family', label: 'FAMILY', icon: 'family' },
]

// JARVIS wordmark, navigation between the real areas of the app, notifications,
// settings and who is signed in.
export default function JarvisHeader({ view, activePanel, unseenNotifications, userName, onNavigate, onOpenNotifications, onOpenSettings }: JarvisHeaderProps) {
  const isActive = (t: HeaderTarget) =>
    t === 'chat' ? view === 'chat' && !activePanel : t === 'voice' ? view === 'voice' && !activePanel : activePanel === t

  return (
    <header className="j-header">
      <div className="j-brand">
        <span className="j-brand-mark" aria-hidden="true">
          <Icon name="core" size={22} />
        </span>
        <div>
          <p className="j-brand-name">JARVIS</p>
          <p className="j-brand-sub">PERSONAL INTELLIGENCE SYSTEM</p>
        </div>
      </div>

      <nav className="j-nav" aria-label="Jarvis sections">
        {NAV.map((n) => (
          <button
            key={n.target}
            type="button"
            className={`j-nav-item ${isActive(n.target) ? 'active' : ''} ${n.mobileOnly ? 'mobile-only' : ''}`}
            onClick={() => onNavigate(n.target)}
            aria-current={isActive(n.target) ? 'page' : undefined}
            aria-label={n.label}
            data-sound={n.target === 'chat' || n.target === 'voice' ? undefined : 'none'}
          >
            <Icon name={n.icon} size={17} />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>

      <div className="j-header-tools">
        <button type="button" className="j-icon-btn" onClick={onOpenNotifications} aria-label={unseenNotifications ? `Notifications, ${unseenNotifications} new` : 'Notifications'} data-sound="none">
          <Icon name="bell" />
          {unseenNotifications > 0 && <span className="j-dot-badge" aria-hidden="true" />}
        </button>
        <button type="button" className="j-icon-btn" onClick={onOpenSettings} aria-label="Settings" data-sound="none">
          <Icon name="sliders" />
        </button>
        <span className="j-user" title={userName}>
          <span className="j-user-avatar" aria-hidden="true">
            {userName.slice(0, 1).toUpperCase()}
          </span>
          <span className="j-user-name">{userName}</span>
        </span>
      </div>
    </header>
  )
}
