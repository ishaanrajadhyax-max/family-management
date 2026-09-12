// Tracks who's logged in (if anyone) for the whole app. On load, checks
// with the server whether the session cookie is still valid, and whether
// no admin has credentials yet (needsSetup) — the frontend never decides
// either of these on its own, it only reflects what the server says.
import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { CurrentUser } from './api'
import * as authApi from './api'

interface AuthContextValue {
  user: CurrentUser | null
  isLoading: boolean
  needsSetup: boolean
  login: (username: string, password: string) => Promise<void>
  setupAdmin: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function bootstrap() {
      try {
        const currentUser = await authApi.getCurrentUser()
        setUser(currentUser)
        if (!currentUser) {
          setNeedsSetup(await authApi.needsSetup())
        }
      } catch {
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    }
    bootstrap()
  }, [])

  async function login(username: string, password: string) {
    const loggedInUser = await authApi.login(username, password)
    setUser(loggedInUser)
  }

  async function setupAdmin(username: string, password: string) {
    const loggedInUser = await authApi.setupAdmin(username, password)
    setUser(loggedInUser)
    setNeedsSetup(false)
  }

  async function logout() {
    await authApi.logout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, needsSetup, login, setupAdmin, logout }}>
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
