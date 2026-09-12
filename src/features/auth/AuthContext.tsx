// Tracks who's logged in (if anyone) for the whole app. On load, checks
// with the server whether the session cookie is still valid — the frontend
// never decides on its own who's authenticated, it only reflects what the
// server says.
import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { CurrentUser } from './api'
import * as authApi from './api'

interface AuthContextValue {
  user: CurrentUser | null
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    authApi
      .getCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false))
  }, [])

  async function login(username: string, password: string) {
    const loggedInUser = await authApi.login(username, password)
    setUser(loggedInUser)
  }

  async function logout() {
    await authApi.logout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- hook belongs next to the context it reads
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
