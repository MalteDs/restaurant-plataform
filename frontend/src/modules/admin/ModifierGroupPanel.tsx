import { useState } from 'react'
import type { FormEvent } from 'react'
import { request } from '../../infrastructure/api/client'
import { Button, Card, Input } from '../../shared/ui'
import type { AdminModifierGroup } from './catalog-admin'

interface Props {
  groups: AdminModifierGroup[]
  onChanged: () => Promise<void>
}

interface OptionDraft {
  key: string
  name: string
  price: string
}

function newOption(): OptionDraft {
  return { key: crypto.randomUUID(), name: '', price: '0' }
}

export default function ModifierGroupPanel({ groups, onChanged }: Props) {
  const [name, setName] = useState('')
  const [minSelection, setMinSelection] = useState('0')
  const [maxSelection, setMaxSelection] = useState('1')
  const [options, setOptions] = useState<OptionDraft[]>([newOption()])
  const [editing, setEditing] = useState<AdminModifierGroup | null>(null)
  const [editName, setEditName] = useState('')
  const [editActive, setEditActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  function updateOption(key: string, field: 'name' | 'price', value: string) {
    setOptions((current) =>
      current.map((option) => option.key === key ? { ...option, [field]: value } : option)
    )
  }

  function removeOption(key: string) {
    setOptions((current) => current.length === 1
      ? current
      : current.filter((option) => option.key !== key))
  }

  function startEdit(group: AdminModifierGroup) {
    setNotice('')
    setError('')
    setEditing(group)
    setEditName(group.name)
    setEditActive(group.active)
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    const trimmed = name.trim()
    const min = Number(minSelection)
    const max = Number(maxSelection)
    if (!trimmed) {
      setError('El nombre del grupo es obligatorio')
      return
    }
    if (!Number.isInteger(min) || min < 0 || !Number.isInteger(max) || max < min) {
      setError('El máximo debe ser un entero mayor o igual al mínimo')
      return
    }
    const modifiers: Array<{ name: string; additionalPricePesos: number }> = []
    for (const option of options) {
      const optionName = option.name.trim()
      const price = Number(option.price)
      if (!optionName) {
        setError('Todas las opciones necesitan nombre')
        return
      }
      if (!Number.isInteger(price) || price < 0) {
        setError('Los precios adicionales deben ser enteros mayores o iguales a 0')
        return
      }
      modifiers.push({ name: optionName, additionalPricePesos: price })
    }
    if (modifiers.length === 0) {
      setError('El grupo necesita al menos una opción')
      return
    }

    setSaving(true)
    try {
      await request('/api/catalog/modifier-groups', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed, minSelection: min, maxSelection: max, modifiers })
      })
      setName('')
      setMinSelection('0')
      setMaxSelection('1')
      setOptions([newOption()])
      setNotice('Grupo creado')
      await onChanged()
    } catch {
      setError('No se pudo crear el grupo')
    } finally {
      setSaving(false)
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
    if (!trimmed) {
      setError('El nombre del grupo es obligatorio')
      return
    }
    setSaving(true)
    try {
      await request(`/api/catalog/modifier-groups/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: trimmed, active: editActive })
      })
      setEditing(null)
      setNotice('Grupo actualizado')
      await onChanged()
    } catch {
      setError('No se pudo guardar el grupo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold text-gray-900">Grupos de modificadores</h2>
      {editing ? (
        <form className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3" onSubmit={onEdit}>
          <label className="block text-sm font-medium text-gray-700">
            Nombre del grupo
            <Input className="mt-1" value={editName}
              onChange={(event) => setEditName(event.target.value)} />
          </label>
          <label className="mt-2 flex items-center gap-2 text-sm font-medium text-gray-700">
            <input type="checkbox" checked={editActive}
              onChange={(event) => setEditActive(event.target.checked)} />
            Activo
          </label>
          <p className="mt-2 text-xs text-gray-500">Las opciones se definen al crear el grupo.</p>
          <div className="mt-3 flex gap-2">
            <Button type="submit" disabled={saving}>Guardar grupo</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <form className="mt-3 space-y-3" onSubmit={onCreate}>
          <label className="block text-sm font-medium text-gray-700">
            Nombre del grupo
            <Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <div className="flex gap-2">
            <label className="block w-24 text-sm font-medium text-gray-700">
              Mínimo
              <Input className="mt-1" type="number" min={0} value={minSelection}
                onChange={(event) => setMinSelection(event.target.value)} />
            </label>
            <label className="block w-24 text-sm font-medium text-gray-700">
              Máximo
              <Input className="mt-1" type="number" min={0} value={maxSelection}
                onChange={(event) => setMaxSelection(event.target.value)} />
            </label>
          </div>
          <div className="space-y-2">
            {options.map((option, index) => (
              <div key={option.key} className="flex items-end gap-2">
                <label className="block flex-1 text-sm font-medium text-gray-700">
                  Opción {index + 1}
                  <Input className="mt-1" value={option.name}
                    onChange={(event) => updateOption(option.key, 'name', event.target.value)} />
                </label>
                <label className="block w-32 text-sm font-medium text-gray-700">
                  Precio adicional {index + 1}
                  <Input className="mt-1" type="number" min={0} value={option.price}
                    onChange={(event) => updateOption(option.key, 'price', event.target.value)} />
                </label>
                <Button type="button" variant="ghost" className="px-2 py-1 text-red-600"
                  aria-label={`Quitar opción ${index + 1}`}
                  onClick={() => removeOption(option.key)}>
                  ×
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="ghost" onClick={() => setOptions([...options, newOption()])}>
            Agregar opción
          </Button>
          <div>
            <Button type="submit" disabled={saving}>Crear grupo</Button>
          </div>
        </form>
      )}

      <ul className="mt-3 space-y-1 text-sm">
        {groups.map((group) => (
          <li key={group.id}
            className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 py-2">
            <div>
              <span className="font-medium text-gray-900">{group.name}</span>
              <span className="ml-2 text-xs text-gray-500">
                mín {group.minSelection} · máx {group.maxSelection} · {group.modifiers.length} opciones
              </span>
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                group.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {group.active ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => startEdit(group)}>
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
