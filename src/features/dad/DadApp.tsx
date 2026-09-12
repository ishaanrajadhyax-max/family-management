import { useEffect, useState } from 'react'
import './dad.css'
import { useAuth } from '../auth/AuthContext'
import { DadDataProvider } from './DadDataContext'
import DadSidebar from './DadSidebar'
import DashboardPage from './pages/DashboardPage'
import HealthReadingsPage from './pages/HealthReadingsPage'
import ActivityPage from './pages/ActivityPage'
import HistoryPage from './pages/HistoryPage'
import InsightsPage from './pages/InsightsPage'
import ProfilePage from './pages/ProfilePage'
import * as api from './api'
import type { ApiFamilyMember } from './api'

export type DadPage = 'dashboard' | 'health-readings' | 'activity' | 'history' | 'insights' | 'profile'

// Top-level shell — the name is historical (this started as Dad-only). The
// same pages/components now serve whoever is logged in: Dad and Mom always
// view their own data; Ishaan (admin) can switch which family member he's
// viewing/managing via the sidebar. The server enforces these boundaries
// independently on every request (see server/auth/access.js) — this
// component only decides what to *ask* for.
export default function DadApp() {
  const { user, logout } = useAuth()
  const [activePage, setActivePage] = useState<DadPage>('dashboard')
  const [familyMembers, setFamilyMembers] = useState<ApiFamilyMember[]>([])
  const [viewingId, setViewingId] = useState(user!.id)

  const isAdmin = user!.role === 'admin'

  useEffect(() => {
    if (isAdmin) {
      api.getFamilyMembers().then(setFamilyMembers).catch(() => setFamilyMembers([]))
    }
  }, [isAdmin])

  const viewingMember = familyMembers.find((m) => m.id === viewingId) ?? user!

  return (
    <DadDataProvider familyMemberId={viewingId}>
      <div className="dad-app">
        <DadSidebar
          activePage={activePage}
          onNavigate={setActivePage}
          currentUser={user!}
          onLogout={logout}
          familyMembers={isAdmin ? familyMembers : undefined}
          viewingId={viewingId}
          onChangeViewing={setViewingId}
        />
        <main className="dad-main">
          {activePage === 'dashboard' && <DashboardPage />}
          {activePage === 'health-readings' && <HealthReadingsPage />}
          {activePage === 'activity' && <ActivityPage />}
          {activePage === 'history' && <HistoryPage />}
          {activePage === 'insights' && <InsightsPage />}
          {activePage === 'profile' && <ProfilePage member={viewingMember} />}
        </main>
      </div>
    </DadDataProvider>
  )
}
