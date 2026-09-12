// Thin client for the auth endpoints. Uses the httpOnly session cookie the
// backend sets/reads — this file never touches a token directly.
import { API_BASE_URL } from '../../apiBase'

export interface CurrentUser {
  id: string
  name: string
  role: 'dad' | 'mom' | 'admin'
}

async function authFetch<T>(path: string, options?: RequestInit): Promise<T | null> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      ...options,
    })
  } catch {
    throw new Error('Could not reach the server. Is the backend running (server/)?')
  }

  if (response.status === 401) return null

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || `Request failed with status ${response.status}`)
  }

  return response.json() as Promise<T>
}

// Returns the logged-in user, or null if there's no valid session.
export function getCurrentUser(): Promise<CurrentUser | null> {
  return authFetch<CurrentUser>('/auth/me')
}

export async function login(username: string, password: string): Promise<CurrentUser> {
  const user = await authFetch<CurrentUser>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  if (!user) {
    throw new Error('Invalid username or password')
  }
  return user
}

export async function logout(): Promise<void> {
  await authFetch('/auth/logout', { method: 'POST' })
}
