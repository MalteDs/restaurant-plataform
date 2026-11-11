import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { request } from '../../infrastructure/api/client'
import { db } from '../../infrastructure/database/schema'
import { Button, Card, FormError, Input, PageHeader } from '../../shared/ui'

interface Device {
  id: string
  code: string
  name: string
  status: 'ACTIVE' | 'REVOKED'
}

export default function DevicesScreen() {
  const online = navigator.onLine
  const [devices, setDevices] = useState<Device[]>([])
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')

  async function refresh() {
    setDevices(await request<Device[]>('/api/devices'))
  }

  useEffect(() => {
    if (online) {
      void refresh().catch(() => setError('No se pudieron cargar los dispositivos'))
    }
  }, [online])

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      const created = await request<{ deviceToken: string; code: string }>(
        '/api/devices/register',
        { method: 'POST', body: JSON.stringify({ code, name }) }
      )
      setToken(created.deviceToken)
      // The device that registers itself keeps the token and the display prefix.
      localStorage.setItem('caja.deviceToken', created.deviceToken)
      const location = await request<{ code: string }>('/api/locations/current')
      await db.meta.put({ key: 'devicePrefix', value: `${location.code}-${created.code}` })
      setCode('')
      setName('')
      await refresh()
    } catch {
      setError('No se pudo registrar el dispositivo')
    }
  }

  async function revoke(device: Device) {
    await request(`/api/devices/${device.id}/revoke`, { method: 'POST' })
    await refresh()
  }

  if (!online) {
    return <Card><p className="text-sm text-gray-600">Requiere conexión.</p></Card>
  }

  return (
    <div>
      <PageHeader title="Dispositivos" subtitle="Registro y revocación" />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="pb-2">Código</th>
                <th className="pb-2">Nombre</th>
                <th className="pb-2">Estado</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <tr key={device.id} className="border-t border-gray-100">
                  <td className="py-2">{device.code}</td>
                  <td className="py-2">{device.name}</td>
                  <td className="py-2">{device.status === 'ACTIVE' ? 'Activo' : 'Revocado'}</td>
                  <td className="py-2 text-right">
                    <Button variant="danger" disabled={device.status === 'REVOKED'}
                      onClick={() => void revoke(device)}>Revocar</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <form className="space-y-3" onSubmit={onCreate}>
            <label className="block text-sm font-medium text-gray-700">
              Código
              <Input className="mt-1" maxLength={8} value={code}
                onChange={(event) => setCode(event.target.value)} required />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Nombre
              <Input className="mt-1" value={name}
                onChange={(event) => setName(event.target.value)} required />
            </label>
            <Button className="w-full" type="submit">Registrar dispositivo</Button>
          </form>
          {token ? (
            <p className="mt-3 break-all rounded bg-gray-100 p-2 text-xs text-gray-700">
              Token (guárdalo, no se vuelve a mostrar): {token}
            </p>
          ) : null}
          <FormError className="mt-3">{error}</FormError>
        </Card>
      </div>
    </div>
  )
}
