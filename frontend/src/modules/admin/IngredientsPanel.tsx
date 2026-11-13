import { useState } from 'react'
import type { FormEvent } from 'react'
import { request } from '../../infrastructure/api/client'
import { Button, Card, Input } from '../../shared/ui'
import type { AdminIngredient } from './catalog-admin'

interface Props {
  ingredients: AdminIngredient[]
  onChanged: () => Promise<void>
}

const UNIT_LABELS: Record<AdminIngredient['unit'], string> = {
  UNIT: 'Unidad',
  GRAM: 'Gramo'
}

export default function IngredientsPanel({ ingredients, onChanged }: Props) {
  const [name, setName] = useState('')
  const [unit, setUnit] = useState<AdminIngredient['unit']>('UNIT')
  const [waste, setWaste] = useState('0')
  const [editing, setEditing] = useState<AdminIngredient | null>(null)
  const [editName, setEditName] = useState('')
  const [editUnit, setEditUnit] = useState<AdminIngredient['unit']>('UNIT')
  const [editWaste, setEditWaste] = useState('0')
  const [editActive, setEditActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    const trimmed = name.trim()
    const wastePercent = Number(waste)
    if (!trimmed) {
      setError('El nombre del ingrediente es obligatorio')
      return
    }
    if (!Number.isFinite(wastePercent) || wastePercent < 0 || wastePercent > 100) {
      setError('La merma debe estar entre 0 y 100')
      return
    }
    setSaving(true)
    try {
      await request('/api/catalog/ingredients', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed, unit, wastePercent })
      })
    } catch {
      setError('No se pudo crear el ingrediente')
      setSaving(false)
      return
    }
    setName('')
    setUnit('UNIT')
    setWaste('0')
    setNotice('Ingrediente creado')
    setSaving(false)
    try {
      await onChanged()
    } catch {
      setError('Ingrediente creado, pero no se pudo recargar la lista')
    }
  }

  function startEdit(ingredient: AdminIngredient) {
    setNotice('')
    setError('')
    setEditing(ingredient)
    setEditName(ingredient.name)
    setEditUnit(ingredient.unit)
    setEditWaste(String(ingredient.wastePercent))
    setEditActive(ingredient.active)
  }

  async function onEdit(event: FormEvent) {
    event.preventDefault()
    if (!editing) {
      return
    }
    setError('')
    setNotice('')
    const trimmed = editName.trim()
    const wastePercent = Number(editWaste)
    if (!trimmed) {
      setError('El nombre del ingrediente es obligatorio')
      return
    }
    if (!Number.isFinite(wastePercent) || wastePercent < 0 || wastePercent > 100) {
      setError('La merma debe estar entre 0 y 100')
      return
    }
    setSaving(true)
    try {
      await request(`/api/catalog/ingredients/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: trimmed, unit: editUnit, wastePercent, active: editActive
        })
      })
    } catch {
      setError('No se pudo guardar el ingrediente')
      setSaving(false)
      return
    }
    setEditing(null)
    setNotice('Ingrediente actualizado')
    setSaving(false)
    try {
      await onChanged()
    } catch {
      setError('Ingrediente actualizado, pero no se pudo recargar la lista')
    }
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold text-gray-900">Ingredientes</h2>
      {editing ? (
        <form className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3" onSubmit={onEdit}>
          <label className="block text-sm font-medium text-gray-700">
            Nombre del ingrediente
            <Input className="mt-1" value={editName}
              onChange={(event) => setEditName(event.target.value)} />
          </label>
          <label className="mt-2 block text-sm font-medium text-gray-700">
            Unidad
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              value={editUnit}
              onChange={(event) => setEditUnit(event.target.value as AdminIngredient['unit'])}
            >
              {Object.entries(UNIT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="mt-2 block w-32 text-sm font-medium text-gray-700">
            Merma (%)
            <Input className="mt-1" type="number" min={0} max={100} step="0.01"
              value={editWaste} onChange={(event) => setEditWaste(event.target.value)} />
          </label>
          <label className="mt-2 flex items-center gap-2 text-sm font-medium text-gray-700">
            <input type="checkbox" checked={editActive}
              onChange={(event) => setEditActive(event.target.checked)} />
            Activo
          </label>
          <div className="mt-3 flex gap-2">
            <Button type="submit" disabled={saving}>Guardar ingrediente</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={onCreate}>
          <label className="block flex-1 text-sm font-medium text-gray-700">
            Nombre del ingrediente
            <Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="block w-32 text-sm font-medium text-gray-700">
            Unidad
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              value={unit}
              onChange={(event) => setUnit(event.target.value as AdminIngredient['unit'])}
            >
              {Object.entries(UNIT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="block w-28 text-sm font-medium text-gray-700">
            Merma (%)
            <Input className="mt-1" type="number" min={0} max={100} step="0.01"
              value={waste} onChange={(event) => setWaste(event.target.value)} />
          </label>
          <Button type="submit" disabled={saving}>Crear ingrediente</Button>
        </form>
      )}

      <ul className="mt-3 space-y-1 text-sm">
        {ingredients.map((ingredient) => (
          <li key={ingredient.id}
            className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 py-2">
            <div>
              <span className="font-medium text-gray-900">{ingredient.name}</span>
              <span className="ml-2 text-xs text-gray-500">
                {UNIT_LABELS[ingredient.unit]} · merma {ingredient.wastePercent} %
              </span>
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                ingredient.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {ingredient.active ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            <Button variant="ghost" className="px-2 py-1 text-xs"
              onClick={() => startEdit(ingredient)}>
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
