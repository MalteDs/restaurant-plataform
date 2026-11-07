import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { request } from '../../infrastructure/api/client'

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
  login: (username: string, password: string, locationCode?: string) => Promise<void>
  logout: () => void
  lock: () => void
  unlock: (pin: string) => boolean
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
  const [locked, setLocked] = useState(false)

  const login = useCallback(async (username: string, password: string, locationCode?: string) => {
    const session = await request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, locationCode })
    })
    localStorage.setItem(USER_KEY, JSON.stringify(session.user))
    localStorage.setItem(ACCESS_KEY, session.accessToken)
    localStorage.setItem(REFRESH_KEY, session.refreshToken)
    setUser(session.user)
    setLocked(false)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
    setUser(null)
    setLocked(false)
  }, [])

  const lock = useCallback(() => setLocked(true), [])
  // The offline PIN arrives in Task 9; until then unlocking is only manual logout.
  const unlock = useCallback(() => false, [])

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
