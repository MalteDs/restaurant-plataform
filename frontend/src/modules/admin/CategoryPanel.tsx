import { useState } from 'react'
import type { FormEvent } from 'react'
import { request } from '../../infrastructure/api/client'
import { Button, Card, Input } from '../../shared/ui'
import type { AdminCategory } from './catalog-admin'

interface Props {
  categories: AdminCategory[]
  onChanged: () => Promise<void>
}

export default function CategoryPanel({ categories, onChanged }: Props) {
  const [name, setName] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [editing, setEditing] = useState<AdminCategory | null>(null)
  const [editName, setEditName] = useState('')
  const [editOrder, setEditOrder] = useState('0')
  const [editActive, setEditActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  function startEdit(category: AdminCategory) {
    setNotice('')
    setError('')
    setEditing(category)
    setEditName(category.name)
    setEditOrder(String(category.sortOrder))
    setEditActive(category.active)
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    const trimmed = name.trim()
    const order = Number(sortOrder)
    if (!trimmed) {
      setError('El nombre es obligatorio')
      return
    }
    if (!Number.isInteger(order) || order < 0) {
      setError('El orden debe ser un entero mayor o igual a 0')
      return
    }
    setSaving(true)
    try {
      await request('/api/catalog/categories', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed, sortOrder: order })
      })
    } catch {
      setError('No se pudo agregar la categoría')
      setSaving(false)
      return
    }
    setName('')
    setSortOrder('0')
    setNotice('Categoría agregada')
    setSaving(false)
    try {
      await onChanged()
    } catch {
      setError('Categoría agregada, pero no se pudo recargar la lista')
    }
  }

  async function onEdit(event: FormEvent) {
    event.preventDefault()
    if (!editing) {
      return
    }
    setError('')
    setNotice('')
    const trimmed = editName.trim()
    const order = Number(editOrder)
    if (!trimmed) {
      setError('El nombre es obligatorio')
      return
    }
    if (!Number.isInteger(order) || order < 0) {
      setError('El orden debe ser un entero mayor o igual a 0')
      return
    }
    setSaving(true)
    try {
      await request(`/api/catalog/categories/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: trimmed, sortOrder: order, active: editActive })
      })
    } catch {
      setError('No se pudo guardar la categoría')
      setSaving(false)
      return
    }
    setEditing(null)
    setNotice('Categoría actualizada')
    setSaving(false)
    try {
      await onChanged()
    } catch {
      setError('Categoría actualizada, pero no se pudo recargar la lista')
    }
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold text-gray-900">Categorías</h2>
      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={onCreate}>
        <label className="block flex-1 text-sm font-medium text-gray-700">
          Nueva categoría
          <Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="block w-24 text-sm font-medium text-gray-700">
          Orden
          <Input className="mt-1" type="number" min={0} value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)} />
        </label>
        <Button type="submit" disabled={saving}>Agregar categoría</Button>
      </form>

      {editing ? (
        <form className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3" onSubmit={onEdit}>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block flex-1 text-sm font-medium text-gray-700">
              Nombre
              <Input className="mt-1" value={editName}
                onChange={(event) => setEditName(event.target.value)} />
            </label>
            <label className="block w-24 text-sm font-medium text-gray-700">
              Orden
              <Input className="mt-1" type="number" min={0} value={editOrder}
                onChange={(event) => setEditOrder(event.target.value)} />
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm font-medium text-gray-700">
              <input type="checkbox" checked={editActive}
                onChange={(event) => setEditActive(event.target.checked)} />
              Activo
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <Button type="submit" disabled={saving}>Guardar categoría</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}

      <ul className="mt-3 space-y-1 text-sm">
        {categories.map((category) => (
          <li key={category.id}
            className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 py-2">
            <div>
              <span className="font-medium text-gray-900">{category.name}</span>
              <span className="ml-2 text-xs text-gray-500">orden {category.sortOrder}</span>
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                category.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {category.active ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => startEdit(category)}>
              Editar
            </Button>
          </li>
        ))}
      </ul>
      {notice ? <p role="status" className="mt-3 text-sm text-green-700">{notice}</p> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-red-600">{error}</p> : null}
    </Card>
  )
}
