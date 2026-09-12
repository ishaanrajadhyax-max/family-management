import { AuthProvider, useAuth } from './features/auth/AuthContext'
import LoginPage from './features/auth/LoginPage'
import DadApp from './features/dad/DadApp'

// Shows the login page until the server confirms a valid session, then
// hands off to the main app. Dad, Mom, and Ishaan (admin) all land in the
// same app shell — role-based access is enforced inside it and on every
// API route server-side.
function AppShell() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return <div className="dad-app-status">Loading…</div>
  }
  if (!user) {
    return <LoginPage />
  }
  return <DadApp />
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}

export default App
