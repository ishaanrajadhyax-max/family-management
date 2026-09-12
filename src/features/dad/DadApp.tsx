import { useState } from 'react'
import './dad.css'
import { DadDataProvider } from './DadDataContext'
import DadSidebar from './DadSidebar'
import DashboardPage from './pages/DashboardPage'
import HealthReadingsPage from './pages/HealthReadingsPage'
import ActivityPage from './pages/ActivityPage'
import HistoryPage from './pages/HistoryPage'
import InsightsPage from './pages/InsightsPage'
import ProfilePage from './pages/ProfilePage'

export type DadPage = 'dashboard' | 'health-readings' | 'activity' | 'history' | 'insights' | 'profile'

// Top-level shell for the Dad section: sidebar navigation + whichever page
// is active. Navigation is simple local state for now (no router package)
// since this section isn't URL-driven yet.
//
// Data flow today:  DadDataProvider (empty in-memory state) -> pages/forms
// Data flow later:  React frontend -> Backend/API -> PostgreSQL
export default function DadApp() {
  const [activePage, setActivePage] = useState<DadPage>('dashboard')

  return (
    <DadDataProvider>
      <div className="dad-app">
        <DadSidebar activePage={activePage} onNavigate={setActivePage} />
        <main className="dad-main">
          {activePage === 'dashboard' && <DashboardPage />}
          {activePage === 'health-readings' && <HealthReadingsPage />}
          {activePage === 'activity' && <ActivityPage />}
          {activePage === 'history' && <HistoryPage />}
          {activePage === 'insights' && <InsightsPage />}
          {activePage === 'profile' && <ProfilePage />}
        </main>
      </div>
    </DadDataProvider>
  )
}
