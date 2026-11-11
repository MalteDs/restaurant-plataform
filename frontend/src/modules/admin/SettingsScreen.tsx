import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { request } from '../../infrastructure/api/client'
import { db } from '../../infrastructure/database/schema'
import { Button, Card, FormError, Input, PageHeader } from '../../shared/ui'

interface Location {
  id: string
  code: string
  name: string
  catalogVersion: number
}

interface ExpenseCategory {
  id: string
  name: string
  active: boolean
}

export default function SettingsScreen() {
  const online = navigator.onLine
  const [location, setLocation] = useState<Location | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [newCategory, setNewCategory] = useState('')
  const [categoryMessage, setCategoryMessage] = useState('')
  const [categoryError, setCategoryError] = useState('')

  async function refresh() {
    const current = await request<Location>('/api/locations/current')
    setLocation(current)
    setName(current.name)
    setCode(current.code)
    await db.meta.put({ key: 'locationName', value: current.name })
  }

  async function refreshCategories() {
    setCategories(await request<ExpenseCategory[]>('/api/expenses/categories'))
  }

  useEffect(() => {
    if (online) {
      void refresh().catch(() => setError('No se pudo cargar la sede'))
      void refreshCategories().catch(() => setCategoryError('No se pudieron cargar las categorías'))
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

  async function onCreateCategory(event: FormEvent) {
    event.preventDefault()
    setCategoryError('')
    setCategoryMessage('')
    try {
      await request('/api/expenses/categories', {
        method: 'POST',
        body: JSON.stringify({ name: newCategory })
      })
      setNewCategory('')
      setCategoryMessage('Categoría agregada')
      await refreshCategories()
    } catch {
      setCategoryError('No se pudo agregar la categoría')
    }
  }

  async function toggleCategory(category: ExpenseCategory) {
    setCategoryError('')
    setCategoryMessage('')
    try {
      await request(`/api/expenses/categories/${category.id}`, {
        method: 'PUT',
        body: JSON.stringify({ active: !category.active })
      })
      await refreshCategories()
    } catch {
      setCategoryError('No se pudo actualizar la categoría')
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
          <FormError>{error}</FormError>
        </form>
      </Card>
      <Card className="mt-4 max-w-md">
        <h2 className="mb-3 font-semibold text-gray-900">Categorías de gasto</h2>
        <form className="flex items-end gap-2" onSubmit={onCreateCategory}>
          <label className="block flex-1 text-sm font-medium text-gray-700">
            Nueva categoría
            <Input className="mt-1" value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)} required />
          </label>
          <Button type="submit">Agregar</Button>
        </form>
        <ul className="mt-3 space-y-2 text-sm">
          {categories.map((category) => (
            <li key={category.id}
              className="flex items-center justify-between border-t border-gray-100 pt-2">
              <span className={category.active ? 'text-gray-900' : 'text-gray-400'}>
                {category.name}
              </span>
              <Button variant="ghost" className="px-2 py-1 text-xs"
                onClick={() => void toggleCategory(category)}>
                {category.active ? 'Desactivar' : 'Activar'}
              </Button>
            </li>
          ))}
        </ul>
        {categoryMessage ? <p className="mt-3 text-sm text-green-700">{categoryMessage}</p> : null}
        <FormError>{categoryError}</FormError>
      </Card>
    </div>
  )
}
