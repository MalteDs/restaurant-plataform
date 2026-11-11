import { useState } from 'react'
import type { FormEvent } from 'react'
import { request } from '../../infrastructure/api/client'
import { Button, Card, Input } from '../../shared/ui'
import RecipeEditor from './RecipeEditor'
import type { AdminAddon, AdminIngredient, RecipeItemInput } from './catalog-admin'

interface Props {
  addons: AdminAddon[]
  ingredients: AdminIngredient[]
  onChanged: () => Promise<void>
}

function emptyRecipe(ingredients: AdminIngredient[]): RecipeItemInput[] {
  return ingredients.length > 0 ? [{ ingredientId: '', quantity: 0 }] : []
}

function cleanRecipe(recipe: RecipeItemInput[]): RecipeItemInput[] {
  return recipe.filter((row) => row.ingredientId !== '')
}

export default function AddonsPanel({ addons, ingredients, onChanged }: Props) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('0')
  const [recipe, setRecipe] = useState<RecipeItemInput[]>(() => emptyRecipe(ingredients))
  const [editing, setEditing] = useState<AdminAddon | null>(null)
  const [editPrice, setEditPrice] = useState('0')
  const [editActive, setEditActive] = useState(true)
  const [editRecipe, setEditRecipe] = useState<RecipeItemInput[]>([])
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  function validate(rows: RecipeItemInput[]): string | null {
    if (rows.some((row) => row.quantity <= 0)) {
      return 'La cantidad de cada ingrediente debe ser mayor que cero'
    }
    if (new Set(rows.map((row) => row.ingredientId)).size !== rows.length) {
      return 'No repitas el mismo ingrediente en la receta'
    }
    return null
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    const trimmed = name.trim()
    const pricePesos = Number(price)
    if (!trimmed) {
      setError('El nombre del adicional es obligatorio')
      return
    }
    if (!Number.isInteger(pricePesos) || pricePesos < 0) {
      setError('El precio debe ser un entero mayor o igual a 0')
      return
    }
    const rows = cleanRecipe(recipe)
    const recipeError = validate(rows)
    if (recipeError) {
      setError(recipeError)
      return
    }
    setSaving(true)
    try {
      await request('/api/catalog/addons', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed, pricePesos, recipe: rows })
      })
    } catch {
      setError('No se pudo crear el adicional')
      setSaving(false)
      return
    }
    setName('')
    setPrice('0')
    setRecipe(emptyRecipe(ingredients))
    setNotice('Adicional creado')
    setSaving(false)
    try {
      await onChanged()
    } catch {
      setError('Adicional creado, pero no se pudo recargar la lista')
    }
  }

  function startEdit(addon: AdminAddon) {
    setNotice('')
    setError('')
    setEditing(addon)
    setEditPrice(String(addon.pricePesos))
    setEditActive(addon.active)
    setEditRecipe(addon.recipe.length > 0
      ? addon.recipe
      : emptyRecipe(ingredients))
  }

  async function onEdit(event: FormEvent) {
    event.preventDefault()
    if (!editing) {
      return
    }
    setError('')
    setNotice('')
    const pricePesos = Number(editPrice)
    if (!Number.isInteger(pricePesos) || pricePesos < 0) {
      setError('El precio debe ser un entero mayor o igual a 0')
      return
    }
    const rows = cleanRecipe(editRecipe)
    const recipeError = validate(rows)
    if (recipeError) {
      setError(recipeError)
      return
    }
    setSaving(true)
    try {
      await request(`/api/catalog/addons/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify({ pricePesos, active: editActive, recipe: rows })
      })
    } catch {
      setError('No se pudo guardar el adicional')
      setSaving(false)
      return
    }
    setEditing(null)
    setNotice('Adicional actualizado')
    setSaving(false)
    try {
      await onChanged()
    } catch {
      setError('Adicional actualizado, pero no se pudo recargar la lista')
    }
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold text-gray-900">Adicionales</h2>
      {editing ? (
        <form className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3" onSubmit={onEdit}>
          <p className="text-sm font-medium text-gray-700">{editing.name}</p>
          <label className="mt-2 block text-sm font-medium text-gray-700">
            Precio
            <Input className="mt-1" type="number" min={0} value={editPrice}
              onChange={(event) => setEditPrice(event.target.value)} />
          </label>
          <label className="mt-2 flex items-center gap-2 text-sm font-medium text-gray-700">
            <input type="checkbox" checked={editActive}
              onChange={(event) => setEditActive(event.target.checked)} />
            Activo
          </label>
          <div className="mt-2">
            <RecipeEditor ingredients={ingredients} value={editRecipe} onChange={setEditRecipe} />
          </div>
          <div className="mt-3 flex gap-2">
            <Button type="submit" disabled={saving}>Guardar adicional</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <form className="mt-3 space-y-3" onSubmit={onCreate}>
          <label className="block text-sm font-medium text-gray-700">
            Nombre del adicional
            <Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="block w-40 text-sm font-medium text-gray-700">
            Precio
            <Input className="mt-1" type="number" min={0} value={price}
              onChange={(event) => setPrice(event.target.value)} />
          </label>
          <RecipeEditor ingredients={ingredients} value={recipe} onChange={setRecipe} />
          <Button type="submit" disabled={saving}>Crear adicional</Button>
        </form>
      )}

      <ul className="mt-3 space-y-1 text-sm">
        {addons.map((addon) => (
          <li key={addon.id}
            className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 py-2">
            <div>
              <span className="font-medium text-gray-900">{addon.name}</span>
              <span className="ml-2 text-xs text-gray-500">
                ${addon.pricePesos.toLocaleString('es-CO')} · {addon.recipe.length} ingredientes
              </span>
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                addon.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {addon.active ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => startEdit(addon)}>
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
