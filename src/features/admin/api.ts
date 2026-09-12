// Thin client for the admin-only user management endpoints. Every call
// here relies on the httpOnly session cookie the browser already sends —
// the backend independently re-checks admin access on every request
// (server/routes/adminUsers.js, mounted behind requireAdmin), so nothing
// here is a substitute for that.
import { API_BASE_URL } from '../../apiBase'

export type FamilyRole = 'dad' | 'mom' | 'admin'

export interface AdminUser {
  id: string
  name: string
  username: string
  role: FamilyRole
  isActive: boolean
  createdAt: string
}

async function adminFetch<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/admin/users${path}`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      ...options,
    })
  } catch {
    throw new Error('Could not reach the server. Is the backend running (server/)?')
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || `Request failed with status ${response.status}`)
  }

  return response.json() as Promise<T>
}

export function listUsers(): Promise<AdminUser[]> {
  return adminFetch('')
}

export function createUser(payload: {
  name: string
  username: string
  role: FamilyRole
  password: string
}): Promise<AdminUser> {
  return adminFetch('', { method: 'POST', body: JSON.stringify(payload) })
}

export function updateUser(
  id: string,
  payload: { name: string; username: string; role: FamilyRole },
): Promise<AdminUser> {
  return adminFetch(`/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
}

export function resetPassword(id: string, password: string): Promise<AdminUser> {
  return adminFetch(`/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) })
}

export function setAccountStatus(id: string, isActive: boolean): Promise<AdminUser> {
  return adminFetch(`/${id}/status`, { method: 'POST', body: JSON.stringify({ isActive }) })
}
