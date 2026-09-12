import { useEffect, useState } from 'react'
import SectionCard from '../dad/components/SectionCard'
import EmptyState from '../dad/components/EmptyState'
import Modal from '../dad/components/Modal'
import * as adminApi from './api'
import type { AdminUser, FamilyRole } from './api'
import AddUserForm from './AddUserForm'
import EditUserForm from './EditUserForm'
import ResetPasswordForm from './ResetPasswordForm'

type ActiveModal =
  | { kind: 'add' }
  | { kind: 'edit'; user: AdminUser }
  | { kind: 'reset'; user: AdminUser }
  | null

const ROLE_LABELS: Record<FamilyRole, string> = {
  dad: 'Dad',
  mom: 'Mom',
  admin: 'Admin',
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [activeModal, setActiveModal] = useState<ActiveModal>(null)
  const [pendingStatusId, setPendingStatusId] = useState<string | null>(null)

  useEffect(() => {
    async function loadUsers() {
      setStatus('loading')
      try {
        const result = await adminApi.listUsers()
        setUsers(result)
        setStatus('ready')
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load users.')
        setStatus('error')
      }
    }
    loadUsers()
  }, [])

  async function handleToggleStatus(user: AdminUser) {
    if (user.isActive) {
      const confirmed = window.confirm(
        `Disable ${user.name}'s account? They will be signed out and won't be able to log in until re-enabled.`,
      )
      if (!confirmed) return
    }
    setActionError('')
    setPendingStatusId(user.id)
    try {
      const updated = await adminApi.setAccountStatus(user.id, !user.isActive)
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update account status.')
    } finally {
      setPendingStatusId(null)
    }
  }

  function handleSaved(updated: AdminUser, isNew: boolean) {
    setUsers((prev) => (isNew ? [...prev, updated] : prev.map((u) => (u.id === updated.id ? updated : u))))
    setActiveModal(null)
  }

  return (
    <div className="dad-page">
      <div className="dad-page-header">
        <h1>User Management</h1>
      </div>
      <p className="dad-page-note">
        Admin only. Add family accounts, edit details, reset passwords, or disable access —
        deleting an account isn't offered here, since it would also erase that person's health
        history; disabling achieves the same result safely.
      </p>

      <SectionCard
        title="Family Members"
        action={
          <button type="button" className="dad-btn-primary dad-btn-small" onClick={() => setActiveModal({ kind: 'add' })}>
            Add User
          </button>
        }
      >
        {actionError && <p className="dad-form-error">{actionError}</p>}

        {status === 'loading' && <p className="dad-form-hint">Loading users…</p>}
        {status === 'error' && <EmptyState message={errorMessage} />}
        {status === 'ready' && users.length === 0 && <EmptyState message="No family members yet." />}

        {status === 'ready' && users.length > 0 && (
          <ul className="dad-user-list">
            {users.map((user) => (
              <li key={user.id} className="dad-user-row">
                <div className="dad-user-identity">
                  <span className="dad-user-name">{user.name}</span>
                  <span className="dad-user-username">@{user.username}</span>
                </div>
                <span className="dad-user-role-badge">{ROLE_LABELS[user.role]}</span>
                <span className={user.isActive ? 'dad-status-badge active' : 'dad-status-badge disabled'}>
                  {user.isActive ? 'Active' : 'Disabled'}
                </span>
                <div className="dad-user-actions">
                  <button type="button" className="dad-edit-link" onClick={() => setActiveModal({ kind: 'edit', user })}>
                    Edit
                  </button>
                  <button type="button" className="dad-edit-link" onClick={() => setActiveModal({ kind: 'reset', user })}>
                    Reset Password
                  </button>
                  <button
                    type="button"
                    className="dad-edit-link"
                    disabled={pendingStatusId === user.id}
                    onClick={() => handleToggleStatus(user)}
                  >
                    {user.isActive ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {activeModal?.kind === 'add' && (
        <Modal title="Add User" onClose={() => setActiveModal(null)}>
          <AddUserForm onSaved={(user) => handleSaved(user, true)} onCancel={() => setActiveModal(null)} />
        </Modal>
      )}
      {activeModal?.kind === 'edit' && (
        <Modal title="Edit User" onClose={() => setActiveModal(null)}>
          <EditUserForm
            user={activeModal.user}
            onSaved={(user) => handleSaved(user, false)}
            onCancel={() => setActiveModal(null)}
          />
        </Modal>
      )}
      {activeModal?.kind === 'reset' && (
        <Modal title={`Reset Password — ${activeModal.user.name}`} onClose={() => setActiveModal(null)}>
          <ResetPasswordForm
            user={activeModal.user}
            onSaved={() => setActiveModal(null)}
            onCancel={() => setActiveModal(null)}
          />
        </Modal>
      )}
    </div>
  )
}
