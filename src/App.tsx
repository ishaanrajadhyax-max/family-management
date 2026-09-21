import { useState } from 'react'
import { AuthProvider, useAuth } from './features/auth/AuthContext'
import LoginPage from './features/auth/LoginPage'
import JarvisApp from './features/jarvis/JarvisApp'
import DadApp from './features/dad/DadApp'
import './appShell.css'

type Section = 'jarvis' | 'family'

// Jarvis is the primary interface and fills the screen; its header has a FAMILY
// entry that switches to Family Management (the original health tracker),
// which stays fully intact and is mounted exactly as it always was, under a
// slim bar with the way back. Nothing about DadApp itself changes here.
function MainShell() {
  const [section, setSection] = useState<Section>('jarvis')

  if (section === 'jarvis') {
    return (
      <div className="app-shell app-shell-jarvis">
        <JarvisApp onOpenFamily={() => setSection('family')} />
      </div>
    )
  }

  return (
    <div className="app-shell">
      <nav className="app-shell-tabs" aria-label="App section">
        <button type="button" className="app-shell-tab" onClick={() => setSection('jarvis')}>
          <span className="app-shell-mark" aria-hidden="true" />
          JARVIS
        </button>
        <button type="button" className="app-shell-tab active" aria-current="page">
          FAMILY MANAGEMENT
        </button>
      </nav>
      <div className="app-shell-body">
        <DadApp />
      </div>
    </div>
  )
}

// Shows the login page (or, for the very first run, the one-time admin
// setup screen) until the server confirms a valid session, then hands off
// to the main shell. Dad, Mom, and Ishaan (admin) all land in the same
// shell — role-based access is enforced inside it and on every API route
// server-side.
function AppShell() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return <div className="dad-app-status">Loading…</div>
  }
  if (!user) {
    return <LoginPage />
  }
  return <MainShell />
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}

export default App
