import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button, Input } from '../../shared/ui'
import SaleDaysPicker from '../sales/SaleDaysPicker'
import { SALE_DAYS } from '../sales/sale-days'
import RecipeEditor from './RecipeEditor'
import type {
  AdminAddon,
  AdminCategory,
  AdminIngredient,
  AdminProduct,
  DayPriceInput,
  ProductInput,
  RecipeItemInput
} from './catalog-admin'

interface Props {
  product: AdminProduct | null
  kind: 'PRODUCT' | 'COMBO'
  categories: AdminCategory[]
  addons: AdminAddon[]
  ingredients: AdminIngredient[]
  productOptions: AdminProduct[]
  onSave: (input: ProductInput) => Promise<void>
  onCancel: () => void
}

export default function ProductForm({
  product,
  kind,
  categories,
  addons,
  ingredients,
  productOptions,
  onSave,
  onCancel
}: Props) {
  const [name, setName] = useState(product?.name ?? '')
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '')
  const [price, setPrice] = useState(String(product?.pricePesos ?? ''))
  const [cost, setCost] = useState(product?.costPesos === null ? '' : String(product?.costPesos ?? ''))
  const [saleDays, setSaleDays] = useState<number[]>(product?.saleDays ?? [])
  const [dayPrices, setDayPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries((product?.dayPrices ?? []).map((row) => [String(row.weekday), String(row.pricePesos)])))
  const [addonIds, setAddonIds] = useState<string[]>(product?.addonIds ?? [])
  const [recipe, setRecipe] = useState<RecipeItemInput[]>(() => {
    if (product?.recipe?.length) {
      return product.recipe
    }
    return kind === 'PRODUCT' ? [{ ingredientId: '', quantity: 0 }] : []
  })
  const [components, setComponents] = useState<Array<{ productId: string; quantity: number }>>(
    () => (product?.components ?? []).map((component) => ({
      productId: component.productId,
      quantity: component.quantity
    }))
  )
  const [componentProductId, setComponentProductId] = useState('')
  const [componentQuantity, setComponentQuantity] = useState('1')
  const [active, setActive] = useState(product?.active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function toggleAddon(id: string) {
    setAddonIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    )
  }

  function changeDayPrice(weekday: number, value: string) {
    setDayPrices((current) => ({ ...current, [String(weekday)]: value }))
  }

  function addComponent() {
    const quantity = Number(componentQuantity)
    if (!componentProductId || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      setError('Elige un producto y una cantidad entre 1 y 99')
      return
    }
    setError('')
    setComponents((current) => {
      const existing = current.find((row) => row.productId === componentProductId)
      if (existing) {
        return current.map((row) => row.productId === componentProductId
          ? { ...row, quantity: Math.min(99, row.quantity + quantity) }
          : row)
      }
      return [...current, { productId: componentProductId, quantity }]
    })
    setComponentProductId('')
    setComponentQuantity('1')
  }

  function parsedDayPrices(basePrice: number): DayPriceInput[] | null {
    const rows: DayPriceInput[] = []
    for (const day of SALE_DAYS) {
      const raw = dayPrices[String(day.value)]?.trim() ?? ''
      if (raw === '') {
        continue
      }
      const value = Number(raw)
      if (!Number.isInteger(value) || value < 0) {
        setError(`El precio del ${day.label.toLowerCase()} debe ser un entero mayor o igual a 0`)
        return null
      }
      if (value !== basePrice) {
        rows.push({ weekday: day.value, pricePesos: value })
      }
    }
    return rows
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
    const dayPriceRows = parsedDayPrices(pricePesos)
    if (dayPriceRows === null) {
      return
    }
    const cleanRecipe = recipe.filter((row) => row.ingredientId !== '')
    if (cleanRecipe.some((row) => row.quantity <= 0)) {
      setError('La cantidad de cada ingrediente debe ser mayor que cero')
      return
    }
    if (new Set(cleanRecipe.map((row) => row.ingredientId)).size !== cleanRecipe.length) {
      setError('No repitas el mismo ingrediente en la receta')
      return
    }
    if (kind === 'COMBO' && components.length === 0) {
      setError('El combo necesita al menos un componente')
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
        saleDays,
        addonIds,
        dayPrices: dayPriceRows,
        recipe: kind === 'COMBO' ? [] : cleanRecipe,
        components: kind === 'COMBO' ? components : [],
        kind
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar el producto')
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="product-form-title" className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 id="product-form-title" className="text-sm font-semibold text-gray-900">
        {product ? (kind === 'COMBO' ? 'Editar combo' : 'Editar producto') : (kind === 'COMBO' ? 'Nuevo combo' : 'Nuevo producto')}
      </h2>
      <form className="mt-3 space-y-3" onSubmit={onSubmit}>
        <label className="block text-sm font-medium text-gray-700">
          Nombre
          <Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          Categoría
          <select
            aria-label="Categoría"
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

        <SaleDaysPicker value={saleDays} onChange={setSaleDays} />

        <fieldset>
          <legend className="text-sm font-medium text-gray-700">Precios por día</legend>
          <p className="text-xs text-gray-500">Vacío o igual al precio base significa sin cambio.</p>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {SALE_DAYS.map((day) => (
              <label key={day.value} className="block text-sm font-medium text-gray-700">
                Precio del {day.label.toLowerCase()}
                <Input className="mt-1" type="number" min={0}
                  placeholder={price || '0'}
                  value={dayPrices[String(day.value)] ?? ''}
                  onChange={(event) => changeDayPrice(day.value, event.target.value)} />
              </label>
            ))}
          </div>
        </fieldset>

        {product ? (
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input type="checkbox" checked={active}
              onChange={(event) => setActive(event.target.checked)} />
            Activo
          </label>
        ) : null}

        <fieldset>
          <legend className="text-sm font-medium text-gray-700">Adicionales permitidos</legend>
          {addons.length === 0 ? (
            <p className="mt-1 text-xs text-gray-500">
              Crea primero un adicional en la pestaña Adicionales.
            </p>
          ) : (
            <div className="mt-1 space-y-1">
              {addons.map((addon) => (
                <label key={addon.id} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={addonIds.includes(addon.id)}
                    onChange={() => toggleAddon(addon.id)}
                  />
                  {addon.name} +${addon.pricePesos.toLocaleString('es-CO')}
                  {addon.active ? '' : ' (inactivo)'}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        {kind === 'PRODUCT' ? (
          <RecipeEditor ingredients={ingredients} value={recipe} onChange={setRecipe} />
        ) : (
          <fieldset>
            <legend className="text-sm font-medium text-gray-700">Composición</legend>
            <div className="mt-1 flex flex-wrap items-end gap-2">
              <label className="block flex-1 text-sm font-medium text-gray-700">
                Producto componente
                <select
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                  value={componentProductId}
                  onChange={(event) => setComponentProductId(event.target.value)}
                >
                  <option value="">Selecciona</option>
                  {productOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.name}</option>
                  ))}
                </select>
              </label>
              <label className="block w-28 text-sm font-medium text-gray-700">
                Cantidad del componente
                <Input className="mt-1" type="number" min={1} max={99}
                  value={componentQuantity}
                  onChange={(event) => setComponentQuantity(event.target.value)} />
              </label>
              <Button type="button" variant="ghost" onClick={addComponent}>
                Agregar componente
              </Button>
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {components.map((component) => {
                const option = productOptions.find((row) => row.id === component.productId)
                  ?? product?.components.find((row) => row.productId === component.productId)
                return (
                  <li key={component.productId}
                    className="flex items-center justify-between gap-2 border-t border-gray-100 py-1">
                    <span>{component.quantity} × {option?.name ?? component.productId}</span>
                    <Button type="button" variant="ghost" className="px-2 py-1 text-red-600"
                      aria-label={`Quitar componente ${option?.name ?? component.productId}`}
                      onClick={() => setComponents((current) =>
                        current.filter((row) => row.productId !== component.productId))}>
                      ×
                    </Button>
                  </li>
                )
              })}
            </ul>
            {components.length === 0 ? (
              <p className="mt-1 text-xs text-gray-500">
                Agrega al menos un producto para armar el combo.
              </p>
            ) : null}
          </fieldset>
        )}

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
