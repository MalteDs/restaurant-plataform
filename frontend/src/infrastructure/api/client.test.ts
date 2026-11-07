import { beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from './client'

describe('api client', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
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
})
