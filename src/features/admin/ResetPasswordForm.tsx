import { useState } from 'react'
import type { FormEvent } from 'react'
import * as adminApi from './api'
import type { AdminUser } from './api'

interface ResetPasswordFormProps {
  user: AdminUser
  onSaved: () => void
  onCancel: () => void
}

const MIN_LENGTH = 8

export default function ResetPasswordForm({ user, onSaved, onCancel }: ResetPasswordFormProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters.`)
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsSaving(true)
    setError('')
    try {
      await adminApi.resetPassword(user.id, password)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="dad-form" onSubmit={handleSubmit}>
      <p className="dad-form-hint">
        Setting a new password for <strong>{user.name}</strong> (@{user.username}). They'll need to sign in again
        with this new password.
      </p>
      <div className="dad-form-row">
        <label htmlFor="reset-password-new">New password</label>
        <input
          id="reset-password-new"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={MIN_LENGTH}
          required
          autoFocus
        />
      </div>
      <div className="dad-form-row">
        <label htmlFor="reset-password-confirm">Confirm new password</label>
        <input
          id="reset-password-confirm"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          minLength={MIN_LENGTH}
          required
        />
      </div>

      {error && <p className="dad-form-error">{error}</p>}

      <div className="dad-form-actions">
        <button type="button" className="dad-btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="dad-btn-primary" disabled={isSaving}>
          {isSaving ? 'Resetting…' : 'Reset Password'}
        </button>
      </div>
    </form>
  )
}
