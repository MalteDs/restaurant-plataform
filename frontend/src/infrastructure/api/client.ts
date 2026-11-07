const BASE_URL = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem('caja.refreshToken')
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
  localStorage.setItem('caja.accessToken', session.accessToken)
  localStorage.setItem('caja.refreshToken', session.refreshToken)
  if (session.user) {
    localStorage.setItem('caja.user', JSON.stringify(session.user))
  }
  return true
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const accessToken = localStorage.getItem('caja.accessToken')
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
  if (response.status === 401 && !path.startsWith('/api/auth/')) {
    if (await refreshAccessToken()) {
      const retryHeaders = new Headers(headers)
      const renewed = localStorage.getItem('caja.accessToken')
      if (renewed) {
        retryHeaders.set('Authorization', `Bearer ${renewed}`)
      }
      response = await fetch(`${BASE_URL}${path}`, { ...init, headers: retryHeaders })
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
