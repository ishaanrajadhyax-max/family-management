import type { DadPage } from './DadApp'

interface NavItem {
  page: DadPage
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { page: 'dashboard', label: 'Dashboard' },
  { page: 'health-readings', label: 'Health Readings' },
  { page: 'activity', label: 'Activity' },
  { page: 'history', label: 'History' },
  { page: 'insights', label: 'Insights' },
  { page: 'profile', label: 'Profile / Settings' },
]

interface DadSidebarProps {
  activePage: DadPage
  onNavigate: (page: DadPage) => void
}

export default function DadSidebar({ activePage, onNavigate }: DadSidebarProps) {
  return (
    <nav className="dad-sidebar" aria-label="Dad section navigation">
      <div className="dad-sidebar-header">
        <span className="dad-sidebar-title">Family Management</span>
        <span className="dad-sidebar-subtitle">Dad's Dashboard</span>
      </div>
      <ul className="dad-sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <li key={item.page}>
            <button
              type="button"
              className={item.page === activePage ? 'dad-sidebar-link active' : 'dad-sidebar-link'}
              onClick={() => onNavigate(item.page)}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
