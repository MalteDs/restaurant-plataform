import { useEffect, useMemo, useRef, useState } from 'react'
import { db, type CajaDb, type ModifierGroupRow, type ModifierRow, type ProductRow } from '../../infrastructure/database/schema'
import { createSale, lineTotal, type CreatedSale, type SaleInput } from '../../application/use-cases/sales/create-sale'
import { Button, Card, Input, PageHeader } from '../../shared/ui'

interface CartLine {
  key: string
  product: ProductRow
  quantity: number
  modifiers: ModifierRow[]
}

interface SaleScreenProps {
  database?: CajaDb
  onCreateSale?: (input: SaleInput) => Promise<CreatedSale>
}

export default function SaleScreen({ database = db, onCreateSale }: SaleScreenProps) {
  const [products, setProducts] = useState<ProductRow[]>([])
  const [groups, setGroups] = useState<ModifierGroupRow[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [type, setType] = useState<SaleInput['type']>('COUNTER')
  const [tableLabel, setTableLabel] = useState('')
  const [deliveryFee, setDeliveryFee] = useState(0)
  const [method, setMethod] = useState<SaleInput['method']>('CASH')
  const [picking, setPicking] = useState<ProductRow | null>(null)
  const [selected, setSelected] = useState<Record<string, ModifierRow[]>>({})
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const lastCharge = useRef(0)

  useEffect(() => {
    void database.products.toArray().then((rows) => setProducts(rows.filter((row) => row.active)))
    void database.modifierGroups.toArray().then(setGroups)
  }, [database])

  const grouped = useMemo(() => {
    const byCategory = new Map<string, ProductRow[]>()
    for (const product of products) {
      const list = byCategory.get(product.categoryName) ?? []
      list.push(product)
      byCategory.set(product.categoryName, list)
    }
    return [...byCategory.entries()]
  }, [products])

  const total = cart.reduce((sum, line) => sum + lineTotal({
    productId: line.product.id,
    productName: line.product.name,
    categoryName: line.product.categoryName,
    quantity: line.quantity,
    unitPricePesos: line.product.pricePesos,
    costPesos: line.product.costPesos,
    modifiers: line.modifiers,
    components: line.product.components
  }), 0) + (type === 'DELIVERY' ? deliveryFee : 0)

  function addLine(product: ProductRow, modifiers: ModifierRow[]) {
    setCart((current) => [
      ...current,
      { key: crypto.randomUUID(), product, quantity: 1, modifiers }
    ])
  }

  function pick(product: ProductRow) {
    if (product.modifierGroupIds.length === 0) {
      addLine(product, [])
      return
    }
    setPicking(product)
    setSelected({})
  }

  function toggleModifier(group: ModifierGroupRow, modifier: ModifierRow) {
    setSelected((current) => {
      const chosen = current[group.id] ?? []
      if (chosen.some((item) => item.id === modifier.id)) {
        return { ...current, [group.id]: chosen.filter((item) => item.id !== modifier.id) }
      }
      if (chosen.length >= group.maxSelection) {
        return current
      }
      return { ...current, [group.id]: [...chosen, modifier] }
    })
  }

  function confirmModifiers() {
    if (!picking) {
      return
    }
    const productGroups = groups.filter((group) => picking.modifierGroupIds.includes(group.id))
    const valid = productGroups.every((group) => (selected[group.id]?.length ?? 0) >= group.minSelection)
    if (!valid) {
      return
    }
    addLine(picking, productGroups.flatMap((group) => selected[group.id] ?? []))
    setPicking(null)
    setSelected({})
  }

  function changeQuantity(key: string, delta: number) {
    setCart((current) => current
      .map((line) => line.key === key
        ? { ...line, quantity: Math.min(99, Math.max(1, line.quantity + delta)) }
        : line)
      .filter((line) => line.quantity > 0))
  }

  async function onCharge() {
    const now = Date.now()
    if (submitting || now - lastCharge.current < 500 || cart.length === 0) {
      return
    }
    lastCharge.current = now
    setError('')
    setMessage('')
    if (type === 'DINE_IN' && !tableLabel.trim()) {
      setError('La mesa necesita una etiqueta')
      return
    }
    setSubmitting(true)
    try {
      const charge = onCreateSale ?? ((input: SaleInput) => createSale(database, input))
      const created = await charge({
        type,
        tableLabel: type === 'DINE_IN' ? tableLabel : null,
        deliveryFeePesos: type === 'DELIVERY' ? deliveryFee : 0,
        method,
        items: cart.map((line) => ({
          productId: line.product.id,
          productName: line.product.name,
          categoryName: line.product.categoryName,
          quantity: line.quantity,
          unitPricePesos: line.product.pricePesos,
          costPesos: line.product.costPesos,
          modifiers: line.modifiers,
          components: line.product.components
        }))
      })
      setCart([])
      setMessage(`Venta ${created.displayCode} guardada`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo cobrar')
    } finally {
      setSubmitting(false)
    }
  }

  const pickingGroups = picking
    ? groups.filter((group) => picking.modifierGroupIds.includes(group.id))
    : []

  return (
    <div>
      <PageHeader title="Venta" subtitle="Precios congelados del catálogo local" />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <div className="space-y-4">
            {grouped.map(([category, items]) => (
              <section key={category}>
                <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                  {category}
                </h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {items.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => pick(product)}
                      className="rounded-lg border border-gray-200 p-3 text-left hover:border-brand-500"
                    >
                      <span className="block text-sm font-semibold text-gray-900">
                        {product.name}
                      </span>
                      <span className="text-sm text-brand-600">
                        ${product.pricePesos.toLocaleString('es-CO')}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 font-semibold text-gray-900">Carrito</h2>
            {cart.length === 0 ? (
              <p className="text-sm text-gray-500">Agrega productos del catálogo.</p>
            ) : (
              <ul className="space-y-3">
                {cart.map((line) => (
                  <li key={line.key} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {line.product.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        ${(line.product.pricePesos
                          + line.modifiers.reduce((sum, m) => sum + m.additionalPricePesos, 0)
                        ).toLocaleString('es-CO')} c/u
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" onClick={() => changeQuantity(line.key, -1)}>-</Button>
                      <span className="w-6 text-center text-sm">{line.quantity}</span>
                      <Button variant="ghost" onClick={() => changeQuantity(line.key, 1)}>+</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 border-t border-gray-200 pt-3 text-right text-lg font-bold text-gray-900">
              Total ${total.toLocaleString('es-CO')}
            </p>
          </Card>

          <Card>
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Tipo
                <select
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={type}
                  onChange={(event) => setType(event.target.value as SaleInput['type'])}
                >
                  <option value="COUNTER">Mostrador</option>
                  <option value="DELIVERY">Domicilio</option>
                  <option value="DINE_IN">Mesa</option>
                </select>
              </label>
              {type === 'DINE_IN' ? (
                <label className="block text-sm font-medium text-gray-700">
                  Mesa
                  <Input className="mt-1" value={tableLabel}
                    onChange={(event) => setTableLabel(event.target.value)} />
                </label>
              ) : null}
              {type === 'DELIVERY' ? (
                <label className="block text-sm font-medium text-gray-700">
                  Envío
                  <Input className="mt-1" type="number" min={0} value={deliveryFee}
                    onChange={(event) => setDeliveryFee(Number(event.target.value) || 0)} />
                </label>
              ) : null}
              <label className="block text-sm font-medium text-gray-700">
                Pago
                <select
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={method}
                  onChange={(event) => setMethod(event.target.value as SaleInput['method'])}
                >
                  <option value="CASH">Efectivo</option>
                  <option value="CARD">Tarjeta</option>
                  <option value="BREB">Bre-B</option>
                </select>
              </label>
              <Button className="w-full" onClick={onCharge} disabled={submitting || cart.length === 0}>
                {submitting ? 'Guardando…' : 'Cobrar'}
              </Button>
              {message ? <p className="text-sm text-green-700">{message}</p> : null}
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
            </div>
          </Card>
        </div>
      </div>

      {picking ? (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <h2 className="mb-3 font-semibold text-gray-900">Modificadores de {picking.name}</h2>
            <div className="space-y-4">
              {pickingGroups.map((group) => (
                <section key={group.id}>
                  <p className="text-sm font-medium text-gray-700">
                    {group.name} (mín {group.minSelection}, máx {group.maxSelection})
                  </p>
                  {group.modifiers.map((modifier) => (
                    <label key={modifier.id} className="mt-1 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={(selected[group.id] ?? []).some((item) => item.id === modifier.id)}
                        onChange={() => toggleModifier(group, modifier)}
                      />
                      {modifier.name} +${modifier.additionalPricePesos.toLocaleString('es-CO')}
                    </label>
                  ))}
                </section>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPicking(null)}>Cancelar</Button>
              <Button onClick={confirmModifiers}>Agregar</Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
