import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button, Input } from '../../shared/ui'
import { formatSaleDays, parseSaleDaysInput } from '../sales/sale-days'
import type {
  AdminCategory,
  AdminModifierGroup,
  AdminProduct,
  ProductInput
} from './catalog-admin'

interface Props {
  product: AdminProduct | null
  categories: AdminCategory[]
  modifierGroups: AdminModifierGroup[]
  onSave: (input: ProductInput) => Promise<void>
  onCancel: () => void
}

export default function ProductForm({
  product,
  categories,
  modifierGroups,
  onSave,
  onCancel
}: Props) {
  const [name, setName] = useState(product?.name ?? '')
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '')
  const [price, setPrice] = useState(String(product?.pricePesos ?? ''))
  const [cost, setCost] = useState(product?.costPesos === null ? '' : String(product?.costPesos ?? ''))
  const [days, setDays] = useState(formatSaleDays(product?.saleDays))
  const [active, setActive] = useState(product?.active ?? true)
  const [groupIds, setGroupIds] = useState<string[]>(product?.modifierGroupIds ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function toggleGroup(id: string) {
    setGroupIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    )
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('El nombre es obligatorio')
      return
    }
    const pricePesos = Number(price)
    if (!Number.isInteger(pricePesos) || pricePesos < 0) {
      setError('El precio debe ser un entero mayor o igual a 0')
      return
    }
    const costPesos = cost.trim() === '' ? 0 : Number(cost)
    if (!Number.isInteger(costPesos) || costPesos < 0) {
      setError('El costo debe ser un entero mayor o igual a 0')
      return
    }

    setSaving(true)
    try {
      await onSave({
        name: trimmedName,
        categoryId: categoryId || null,
        pricePesos,
        costPesos,
        active,
        saleDays: parseSaleDaysInput(days),
        modifierGroupIds: groupIds
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar el producto')
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="product-form-title" className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 id="product-form-title" className="text-sm font-semibold text-gray-900">
        {product ? 'Editar producto' : 'Nuevo producto'}
      </h2>
      {product?.kind === 'COMBO' ? (
        <p className="mt-1 text-xs text-gray-500">
          Combo · la composición se administra por seed.
        </p>
      ) : null}
      <form className="mt-3 space-y-3" onSubmit={onSubmit}>
        <label className="block text-sm font-medium text-gray-700">
          Nombre
          <Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          Categoría
          <select
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            value={categoryId ?? ''}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">Sin categoría</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}{category.active ? '' : ' (inactiva)'}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-gray-700">
          Precio
          <Input className="mt-1" type="number" min={0} value={price}
            onChange={(event) => setPrice(event.target.value)} />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          Costo (opcional)
          <Input className="mt-1" type="number" min={0} value={cost}
            onChange={(event) => setCost(event.target.value)} />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          Días de venta
          <Input className="mt-1" placeholder="todos" value={days}
            onChange={(event) => setDays(event.target.value)} />
          <span className="mt-1 block text-xs text-gray-500">
            1=lunes … 7=domingo, separados por coma; vacío=todos.
          </span>
        </label>
        {product ? (
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input type="checkbox" checked={active}
              onChange={(event) => setActive(event.target.checked)} />
            Activo
          </label>
        ) : null}
        <fieldset>
          <legend className="text-sm font-medium text-gray-700">Grupos de modificadores</legend>
          {modifierGroups.length === 0 ? (
            <p className="mt-1 text-xs text-gray-500">No hay grupos creados.</p>
          ) : (
            <div className="mt-1 space-y-1">
              {modifierGroups.map((group) => (
                <label key={group.id} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={groupIds.includes(group.id)}
                    onChange={() => toggleGroup(group.id)}
                  />
                  {group.name}{group.active ? '' : ' (inactivo)'}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <div className="flex gap-2">
          <Button type="submit" disabled={saving} aria-busy={saving}>
            {saving ? 'Guardando…' : 'Guardar producto'}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
        </div>
        {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      </form>
    </section>
  )
}
