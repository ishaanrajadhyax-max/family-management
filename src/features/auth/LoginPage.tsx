import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from './AuthContext'
import './auth.css'

export default function LoginPage() {
  const { needsSetup } = useAuth()
  return <div className="auth-page">{needsSetup ? <SetupAdminForm /> : <LoginForm />}</div>
}

function LoginForm() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')
    try {
      await login(username, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="auth-card" onSubmit={handleSubmit}>
      <h1 className="auth-title">Family Management</h1>
      <p className="auth-subtitle">Sign in to see your own health &amp; activity records.</p>

      <div className="auth-form-row">
        <label htmlFor="login-username">Username</label>
        <input
          id="login-username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoFocus
        />
      </div>
      <div className="auth-form-row">
        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      {error && <p className="auth-error">{error}</p>}

      <button type="submit" className="auth-submit" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  )
}

// Shown instead of the login form only while no admin account has
// credentials yet (server-checked, see AuthContext/needs-setup). This is
// the one and only way to create the first admin without already being
// logged in as one — no scripts, no terminal, just this page.
function SetupAdminForm() {
  const { setupAdmin } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsSubmitting(true)
    setError('')
    try {
      await setupAdmin(username, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set up the admin account.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="auth-card" onSubmit={handleSubmit}>
      <h1 className="auth-title">Family Management</h1>
      <p className="auth-subtitle">
        No admin account has been set up yet. Create one now — this is a one-time step; once it's
        done, this screen won't appear again.
      </p>

      <div className="auth-form-row">
        <label htmlFor="setup-username">Admin username</label>
        <input
          id="setup-username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoFocus
        />
      </div>
      <div className="auth-form-row">
        <label htmlFor="setup-password">Password</label>
        <input
          id="setup-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        <p className="auth-hint">At least 8 characters.</p>
      </div>
      <div className="auth-form-row">
        <label htmlFor="setup-confirm">Confirm password</label>
        <input
          id="setup-confirm"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          minLength={8}
          required
        />
      </div>

      {error && <p className="auth-error">{error}</p>}

      <button type="submit" className="auth-submit" disabled={isSubmitting}>
        {isSubmitting ? 'Setting up…' : 'Create Admin Account'}
      </button>
    </form>
  )
}
