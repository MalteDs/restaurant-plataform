import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { request, SESSION_EXPIRED_EVENT } from './client'

describe('api client', () => {
  let sessionExpired: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
    sessionExpired = vi.fn()
    window.addEventListener(SESSION_EXPIRED_EVENT, sessionExpired as EventListener)
  })

  afterEach(() => {
    window.removeEventListener(SESSION_EXPIRED_EVENT, sessionExpired as EventListener)
  })

  it('agrega Authorization y X-Device-Token solo en sync', async () => {
    localStorage.setItem('caja.accessToken', 'abc')
    localStorage.setItem('caja.deviceToken', 'dev')
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    await request('/api/catalog')
    let headers = fetchMock.mock.calls[0][1].headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer abc')
    expect(headers.get('X-Device-Token')).toBeNull()

    await request('/api/sync/operations', { method: 'POST', body: '{}' })
    headers = fetchMock.mock.calls[1][1].headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer abc')
    expect(headers.get('X-Device-Token')).toBe('dev')
  })

  it('lanza un error con el estado cuando la respuesta falla', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('no', { status: 401 })))

    await expect(request('/api/catalog')).rejects.toMatchObject({ status: 401 })
  })

  it('no refresca el token de usuario cuando el sync responde 401', async () => {
    localStorage.setItem('caja.refreshToken', 'refresh')
    localStorage.setItem('caja.deviceToken', 'dev')
    const fetchMock = vi.fn().mockResolvedValue(new Response('no', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      request('/api/sync/operations', { method: 'POST', body: '{}' })
    ).rejects.toMatchObject({ status: 401 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/sync/operations')
  })

  it('cierra la sesión y no reintenta en bucle si el refresh falla', async () => {
    localStorage.setItem('caja.accessToken', 'old')
    localStorage.setItem('caja.refreshToken', 'refresh')
    localStorage.setItem('caja.user', '{"id":"u1"}')
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response('no', { status: 401 }))
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(request('/api/catalog')).rejects.toMatchObject({ status: 401 })

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/api/catalog',
      '/api/auth/refresh'
    ])
    expect(localStorage.getItem('caja.accessToken')).toBeNull()
    expect(localStorage.getItem('caja.refreshToken')).toBeNull()
    expect(localStorage.getItem('caja.user')).toBeNull()
    expect(sessionExpired).toHaveBeenCalledTimes(1)
  })

  it('hace un solo refresh aunque varias peticiones reciban 401', async () => {
    localStorage.setItem('caja.accessToken', 'old')
    localStorage.setItem('caja.refreshToken', 'refresh')
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response('no', { status: 401 }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const results = await Promise.allSettled([request('/api/catalog'), request('/api/users')])

    expect(results.every((result) => result.status === 'rejected')).toBe(true)
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/api/auth/refresh'))
    ).toHaveLength(1)
    expect(sessionExpired).toHaveBeenCalledTimes(1)
  })

  it('reintenta la petición con el token renovado', async () => {
    localStorage.setItem('caja.accessToken', 'old')
    localStorage.setItem('caja.refreshToken', 'refresh')
    let catalogCalls = 0
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/api/auth/refresh')) {
        return Promise.resolve(
          new Response(JSON.stringify({ accessToken: 'new', refreshToken: 'refresh-2' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
        )
      }
      catalogCalls++
      if (catalogCalls === 1) {
        return Promise.resolve(new Response('no', { status: 401 }))
      }
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(request('/api/catalog')).resolves.toEqual({ ok: true })

    expect(localStorage.getItem('caja.accessToken')).toBe('new')
    expect(localStorage.getItem('caja.refreshToken')).toBe('refresh-2')
    expect(sessionExpired).not.toHaveBeenCalled()
    const retryHeaders = fetchMock.mock.calls[2][1].headers as Headers
    expect(retryHeaders.get('Authorization')).toBe('Bearer new')
  })
})
