import { useEffect, useState } from 'react'
import './dad.css'
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

// Top-level shell — the name is historical (this started as Dad-only, and
// for this phase it's Dad-only again: no login, no roles). On load, it
// looks up whichever family_members row has role='dad' and uses that id
// for everything — there's no session/identity concept in this phase.
export default function DadApp() {
  const [activePage, setActivePage] = useState<DadPage>('dashboard')
  const [dadMember, setDadMember] = useState<ApiFamilyMember | null>(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let cancelled = false
    api
      .getFamilyMembers()
      .then((members) => {
        if (cancelled) return
        const dad = members.find((m) => m.role === 'dad')
        if (!dad) {
          throw new Error("No family member with role 'dad' exists in the database yet.")
        }
        setDadMember(dad)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Failed to load.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loadError) {
    return (
      <div className="dad-app-status dad-app-status-error">
        <p>Couldn't load the app.</p>
        <p className="dad-form-hint">{loadError}</p>
      </div>
    )
  }
  if (!dadMember) {
    return <div className="dad-app-status">Loading…</div>
  }

  return (
    <DadDataProvider familyMemberId={dadMember.id}>
      <div className="dad-app">
        <DadSidebar activePage={activePage} onNavigate={setActivePage} />
        <main className="dad-main">
          {activePage === 'dashboard' && <DashboardPage />}
          {activePage === 'health-readings' && <HealthReadingsPage />}
          {activePage === 'activity' && <ActivityPage />}
          {activePage === 'history' && <HistoryPage />}
          {activePage === 'insights' && <InsightsPage />}
          {activePage === 'profile' && <ProfilePage member={dadMember} />}
        </main>
      </div>
    </DadDataProvider>
  )
}
