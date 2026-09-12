import { useState } from 'react'
import type { FormEvent } from 'react'
import * as adminApi from './api'
import type { AdminUser, FamilyRole } from './api'

interface EditUserFormProps {
  user: AdminUser
  onSaved: (user: AdminUser) => void
  onCancel: () => void
}

export default function EditUserForm({ user, onSaved, onCancel }: EditUserFormProps) {
  const [name, setName] = useState(user.name)
  const [username, setUsername] = useState(user.username)
  const [role, setRole] = useState<FamilyRole>(user.role)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !username.trim()) return

    setIsSaving(true)
    setError('')
    try {
      const updated = await adminApi.updateUser(user.id, { name: name.trim(), username: username.trim(), role })
      onSaved(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="dad-form" onSubmit={handleSubmit}>
      <div className="dad-form-row">
        <label htmlFor="edit-user-name">Name</label>
        <input id="edit-user-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </div>
      <div className="dad-form-row">
        <label htmlFor="edit-user-username">Username</label>
        <input
          id="edit-user-username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </div>
      <div className="dad-form-row">
        <label htmlFor="edit-user-role">Role</label>
        <select id="edit-user-role" value={role} onChange={(e) => setRole(e.target.value as FamilyRole)}>
          <option value="dad">Dad</option>
          <option value="mom">Mom</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      {error && <p className="dad-form-error">{error}</p>}

      <div className="dad-form-actions">
        <button type="button" className="dad-btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="dad-btn-primary" disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </form>
  )
}
