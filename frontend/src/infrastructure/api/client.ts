const BASE_URL = import.meta.env.VITE_API_URL ?? ''

export const SESSION_EXPIRED_EVENT = 'caja:session-expired'

const ACCESS_KEY = 'caja.accessToken'
const REFRESH_KEY = 'caja.refreshToken'
const USER_KEY = 'caja.user'

let refreshInFlight: Promise<boolean> | null = null

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function clearSession() {
  const hadSession =
    localStorage.getItem(ACCESS_KEY) !== null ||
    localStorage.getItem(REFRESH_KEY) !== null ||
    localStorage.getItem(USER_KEY) !== null
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(USER_KEY)
  if (hadSession) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
  }
}

async function performRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem(REFRESH_KEY)
  if (!refreshToken) {
    return false
  }
  const response = await fetch(`${BASE_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  })
  if (!response.ok) {
    return false
  }
  const session = await response.json()
  localStorage.setItem(ACCESS_KEY, session.accessToken)
  localStorage.setItem(REFRESH_KEY, session.refreshToken)
  if (session.user) {
    localStorage.setItem(USER_KEY, JSON.stringify(session.user))
  }
  return true
}

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null
    })
  }
  try {
    return await refreshInFlight
  } catch {
    return false
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const accessToken = localStorage.getItem(ACCESS_KEY)
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }
  // Device token authenticates sync only; user endpoints must not receive it.
  if (path.startsWith('/api/sync/')) {
    const deviceToken = localStorage.getItem('caja.deviceToken')
    if (deviceToken) {
      headers.set('X-Device-Token', deviceToken)
    }
  }

  let response = await fetch(`${BASE_URL}${path}`, { ...init, headers })
  if (
    response.status === 401 &&
    !path.startsWith('/api/auth/') &&
    !path.startsWith('/api/sync/')
  ) {
    if (await refreshAccessToken()) {
      const retryHeaders = new Headers(headers)
      const renewed = localStorage.getItem(ACCESS_KEY)
      if (renewed) {
        retryHeaders.set('Authorization', `Bearer ${renewed}`)
      }
      response = await fetch(`${BASE_URL}${path}`, { ...init, headers: retryHeaders })
    }
    if (response.status === 401) {
      clearSession()
    }
  }
  if (!response.ok) {
    throw new ApiError(response.status, await response.text())
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}
