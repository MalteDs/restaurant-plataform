import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { request } from '../../infrastructure/api/client'
import { db } from '../../infrastructure/database/schema'
import { activeUserId, saveOfflineSession, unlockOfflineSession } from '../../modules/auth/session'
import { syncCatalog } from '../../application/use-cases/catalog/sync-catalog'

export type Role = 'CASHIER' | 'MANAGER' | 'ADMIN'

export interface User {
  id: string
  username: string
  role: Role
  tenantId: string
  locationId: string
}

interface AuthContextValue {
  user: User | null
  locked: boolean
  login: (username: string, password: string, locationCode?: string, pin?: string) => Promise<void>
  logout: () => void
  lock: () => void
  unlock: (pin: string) => Promise<boolean>
}

interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: User
}

const USER_KEY = 'caja.user'
const ACCESS_KEY = 'caja.accessToken'
const REFRESH_KEY = 'caja.refreshToken'

const AuthContext = createContext<AuthContextValue | null>(null)

function readUser(): User | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as User
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(readUser)
  // A cached session always starts locked: the PIN is required to sell offline.
  const [locked, setLocked] = useState(() => readUser() !== null)

  const login = useCallback(
    async (username: string, password: string, locationCode?: string, pin?: string) => {
      const session = await request<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password, locationCode })
      })
      localStorage.setItem(USER_KEY, JSON.stringify(session.user))
      localStorage.setItem(ACCESS_KEY, session.accessToken)
      localStorage.setItem(REFRESH_KEY, session.refreshToken)
      setUser(session.user)
      setLocked(false)
      if (pin) {
        await saveOfflineSession(db, session.user, pin)
      }
      // Login is online; wait for the local catalog so the sale screen has products.
      try {
        await syncCatalog(db)
      } catch {
        // Keep the previous catalog if the snapshot cannot be downloaded.
      }
    },
    []
  )

  const logout = useCallback(() => {
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
    setUser(null)
    setLocked(false)
  }, [])

  const lock = useCallback(() => setLocked(true), [])

  const unlock = useCallback(
    async (pin: string) => {
      const userId = user?.id ?? (await activeUserId(db))
      if (!userId) {
        return false
      }
      const session = await unlockOfflineSession(db, userId, pin)
      if (!session) {
        return false
      }
      const restored = session.user as User
      localStorage.setItem(USER_KEY, JSON.stringify(restored))
      setUser(restored)
      setLocked(false)
      return true
    },
    [user]
  )

  const value = useMemo(
    () => ({ user, locked, login, logout, lock, unlock }),
    [user, locked, login, logout, lock, unlock]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider')
  }
  return context
}
