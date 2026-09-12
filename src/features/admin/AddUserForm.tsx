import { useState } from 'react'
import type { FormEvent } from 'react'
import * as adminApi from './api'
import type { AdminUser, FamilyRole } from './api'

interface AddUserFormProps {
  onSaved: (user: AdminUser) => void
  onCancel: () => void
}

export default function AddUserForm({ onSaved, onCancel }: AddUserFormProps) {
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<FamilyRole>('dad')
  const [password, setPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !username.trim() || password.length < 8) return

    setIsSaving(true)
    setError('')
    try {
      const created = await adminApi.createUser({ name: name.trim(), username: username.trim(), role, password })
      onSaved(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="dad-form" onSubmit={handleSubmit}>
      <div className="dad-form-row">
        <label htmlFor="add-user-name">Name</label>
        <input id="add-user-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </div>
      <div className="dad-form-row">
        <label htmlFor="add-user-username">Username</label>
        <input
          id="add-user-username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </div>
      <div className="dad-form-row">
        <label htmlFor="add-user-role">Role</label>
        <select id="add-user-role" value={role} onChange={(e) => setRole(e.target.value as FamilyRole)}>
          <option value="dad">Dad</option>
          <option value="mom">Mom</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div className="dad-form-row">
        <label htmlFor="add-user-password">Initial password</label>
        <input
          id="add-user-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        <p className="dad-form-hint">At least 8 characters.</p>
      </div>

      {error && <p className="dad-form-error">{error}</p>}

      <div className="dad-form-actions">
        <button type="button" className="dad-btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="dad-btn-primary" disabled={isSaving}>
          {isSaving ? 'Creating…' : 'Add User'}
        </button>
      </div>
    </form>
  )
}
