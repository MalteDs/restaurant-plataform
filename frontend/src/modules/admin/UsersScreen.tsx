import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { request } from '../../infrastructure/api/client'
import { Button, Card, Input, PageHeader } from '../../shared/ui'

interface AdminUser {
  id: string
  username: string
  role: 'CASHIER' | 'MANAGER' | 'ADMIN'
  active: boolean
}

export default function UsersScreen() {
  const online = navigator.onLine
  const [users, setUsers] = useState<AdminUser[]>([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<AdminUser['role']>('CASHIER')
  const [error, setError] = useState('')

  async function refresh() {
    setUsers(await request<AdminUser[]>('/api/users'))
  }

  useEffect(() => {
    if (online) {
      void refresh().catch(() => setError('No se pudieron cargar los usuarios'))
    }
  }, [online])

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      await request('/api/users', {
        method: 'POST',
        body: JSON.stringify({ username, password, role })
      })
      setUsername('')
      setPassword('')
      await refresh()
    } catch {
      setError('No se pudo crear el usuario')
    }
  }

  async function toggle(user: AdminUser) {
    await request(`/api/users/${user.id}`, {
      method: 'PUT',
      body: JSON.stringify({ active: !user.active })
    })
    await refresh()
  }

  if (!online) {
    return <Card><p className="text-sm text-gray-600">Requiere conexión.</p></Card>
  }

  return (
    <div>
      <PageHeader title="Usuarios" subtitle="Alta, rol y activación" />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="pb-2">Usuario</th>
                <th className="pb-2">Rol</th>
                <th className="pb-2">Activo</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-gray-100">
                  <td className="py-2">{user.username}</td>
                  <td className="py-2">{user.role}</td>
                  <td className="py-2">{user.active ? 'Sí' : 'No'}</td>
                  <td className="py-2 text-right">
                    <Button variant="ghost" onClick={() => void toggle(user)}>
                      {user.active ? 'Desactivar' : 'Activar'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <form className="space-y-3" onSubmit={onCreate}>
            <label className="block text-sm font-medium text-gray-700">
              Usuario
              <Input className="mt-1" value={username}
                onChange={(event) => setUsername(event.target.value)} required />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Contraseña
              <Input className="mt-1" type="password" value={password}
                onChange={(event) => setPassword(event.target.value)} required />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Rol
              <select className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={role} onChange={(event) => setRole(event.target.value as AdminUser['role'])}>
                <option value="CASHIER">Cajero</option>
                <option value="MANAGER">Gerente</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </label>
            <Button className="w-full" type="submit">Crear usuario</Button>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </form>
        </Card>
      </div>
    </div>
  )
}
