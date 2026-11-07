import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { request } from '../../infrastructure/api/client'
import { Button, Card, Input, PageHeader } from '../../shared/ui'

interface Location {
  id: string
  code: string
  name: string
  catalogVersion: number
}

export default function SettingsScreen() {
  const online = navigator.onLine
  const [location, setLocation] = useState<Location | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function refresh() {
    const current = await request<Location>('/api/locations/current')
    setLocation(current)
    setName(current.name)
    setCode(current.code)
  }

  useEffect(() => {
    if (online) {
      void refresh().catch(() => setError('No se pudo cargar la sede'))
    }
  }, [online])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    try {
      await request('/api/locations/current', {
        method: 'PUT',
        body: JSON.stringify({ name, code })
      })
      setMessage('Sede actualizada')
      await refresh()
    } catch {
      setError('No se pudo guardar la sede')
    }
  }

  if (!online) {
    return <Card><p className="text-sm text-gray-600">Requiere conexión.</p></Card>
  }

  return (
    <div>
      <PageHeader title="Configuración"
        subtitle={location ? `Versión de catálogo ${location.catalogVersion}` : undefined} />
      <Card className="max-w-md">
        <form className="space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm font-medium text-gray-700">
            Nombre de la sede
            <Input className="mt-1" value={name}
              onChange={(event) => setName(event.target.value)} required />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Código
            <Input className="mt-1" maxLength={8} value={code}
              onChange={(event) => setCode(event.target.value)} required />
          </label>
          <Button type="submit">Guardar</Button>
          {message ? <p className="text-sm text-green-700">{message}</p> : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </form>
      </Card>
    </div>
  )
}
