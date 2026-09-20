import { useState } from 'react'
import { AuthProvider, useAuth } from './features/auth/AuthContext'
import LoginPage from './features/auth/LoginPage'
import JarvisApp from './features/jarvis/JarvisApp'
import DadApp from './features/dad/DadApp'
import './appShell.css'

type Section = 'jarvis' | 'family'

// Jarvis is the new primary interface; Family Management (the original
// health tracker) stays fully intact underneath it, one tab over — never
// retired, hidden, or broken by this. Nothing about DadApp itself changes
// here, it's mounted exactly as it always was.
function MainShell() {
  const [section, setSection] = useState<Section>('jarvis')

  return (
    <div className="app-shell">
      <nav className="app-shell-tabs" aria-label="App section">
        <button
          type="button"
          className={section === 'jarvis' ? 'app-shell-tab active' : 'app-shell-tab'}
          onClick={() => setSection('jarvis')}
        >
          Jarvis
        </button>
        <button
          type="button"
          className={section === 'family' ? 'app-shell-tab active' : 'app-shell-tab'}
          onClick={() => setSection('family')}
        >
          Family Management
        </button>
      </nav>
      <div className="app-shell-body">
        {section === 'jarvis' ? <JarvisApp /> : <DadApp />}
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
