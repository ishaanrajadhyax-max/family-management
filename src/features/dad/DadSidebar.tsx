import type { DadPage } from './DadApp'
import type { ApiFamilyMember } from './api'
import type { CurrentUser } from '../auth/api'

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
  currentUser: CurrentUser
  onLogout: () => void
  // Only provided for admin — lets Ishaan switch whose data is shown.
  familyMembers?: ApiFamilyMember[]
  viewingId: string
  onChangeViewing: (id: string) => void
}

export default function DadSidebar({
  activePage,
  onNavigate,
  currentUser,
  onLogout,
  familyMembers,
  viewingId,
  onChangeViewing,
}: DadSidebarProps) {
  return (
    <nav className="dad-sidebar" aria-label="Family Management navigation">
      <div className="dad-sidebar-header">
        <span className="dad-sidebar-title">Family Management</span>
        <span className="dad-sidebar-subtitle">Signed in as {currentUser.name}</span>
      </div>

      {familyMembers && familyMembers.length > 0 && (
        <div className="dad-sidebar-viewing">
          <label htmlFor="dad-viewing-select">Viewing</label>
          <select
            id="dad-viewing-select"
            value={viewingId}
            onChange={(e) => onChangeViewing(e.target.value)}
          >
            {familyMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}{member.id === currentUser.id ? ' (you)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

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

      <button type="button" className="dad-sidebar-logout" onClick={onLogout}>
        Log Out
      </button>
    </nav>
  )
}
