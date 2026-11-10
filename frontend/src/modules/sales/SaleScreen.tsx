import { useEffect, useMemo, useRef, useState } from 'react'
import { db, type CajaDb, type ModifierGroupRow, type ModifierRow, type ProductRow } from '../../infrastructure/database/schema'
import { createSale, lineTotal, type CreatedSale, type SaleInput } from '../../application/use-cases/sales/create-sale'
import { useAuth } from '../../app/providers/AuthProvider'
import { Button, Card, Input, PageHeader } from '../../shared/ui'
import { addToCart, type CartLine } from './cart-lines'
import { buildProductFamilies, type ProductFamily } from './product-families'
import { isProductSellable } from './sale-days'
import { printReceipt } from '../printing/receipt'

type PaymentMethod = SaleInput['payments'][number]['method']

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-CO')
}

function categorySectionId(category: string): string {
  return `category-${normalizeSearch(category).replace(/[^a-z0-9]+/g, '-')}`
}

interface SaleScreenProps {
  database?: CajaDb
  onCreateSale?: (input: SaleInput) => Promise<CreatedSale>
  onPrint?: (saleId: string) => Promise<void>
}

export default function SaleScreen({
  database = db,
  onCreateSale,
  onPrint
}: SaleScreenProps) {
  const { user } = useAuth()
  const canOverride = user?.role === 'MANAGER' || user?.role === 'ADMIN'
  const [products, setProducts] = useState<ProductRow[]>([])
  const [groups, setGroups] = useState<ModifierGroupRow[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [type, setType] = useState<SaleInput['type']>('COUNTER')
  const [tableLabel, setTableLabel] = useState('')
  const [deliveryFee, setDeliveryFee] = useState(0)
  const [method, setMethod] = useState<PaymentMethod>('CASH')
  const [splitMode, setSplitMode] = useState(false)
  const [parts, setParts] = useState<Array<{
    key: string
    method: PaymentMethod
    amountPesos: number
  }>>([])
  const [partMethod, setPartMethod] = useState<PaymentMethod>('CARD')
  const [partAmount, setPartAmount] = useState('')
  const [picking, setPicking] = useState<ProductRow | null>(null)
  const [pickingFamily, setPickingFamily] = useState<ProductFamily | null>(null)
  const [selected, setSelected] = useState<Record<string, ModifierRow[]>>({})
  const [priceLine, setPriceLine] = useState<CartLine | null>(null)
  const [priceValue, setPriceValue] = useState('')
  const [priceReason, setPriceReason] = useState('')
  const [priceError, setPriceError] = useState('')
  const [cartOpen, setCartOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [lastSale, setLastSale] = useState<CreatedSale | null>(null)
  const [printError, setPrintError] = useState('')
  const [error, setError] = useState('')
  const [now, setNow] = useState(new Date())
  const lastCharge = useRef(0)
  const toolbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void database.products.toArray().then((rows) => setProducts(rows.filter((row) => row.active)))
    void database.modifierGroups.toArray().then(setGroups)
  }, [database])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const grouped = useMemo(() => {
    const byCategory = new Map<string, ProductFamily[]>()
    for (const family of buildProductFamilies(
      products.filter((row) => isProductSellable(row, now))
    )) {
      const list = byCategory.get(family.categoryName) ?? []
      list.push(family)
      byCategory.set(family.categoryName, list)
    }
    return [...byCategory.entries()]
  }, [products, now])

  const visibleGroups = useMemo(() => {
    const needle = normalizeSearch(query.trim())
    if (!needle) {
      return grouped
    }
    return grouped
      .map(([category, families]) => [
        category,
        families.filter((family) => normalizeSearch(family.name).includes(needle))
      ] as const)
      .filter(([, families]) => families.length > 0)
  }, [grouped, query])

  const cartUnits = cart.reduce((sum, line) => sum + line.quantity, 0)

  const total = cart.reduce((sum, line) => sum + lineTotal({
    productId: line.product.id,
    productName: line.product.name,
    categoryName: line.product.categoryName,
    quantity: line.quantity,
    unitPricePesos: line.unitPricePesos,
    catalogUnitPricePesos: line.catalogUnitPricePesos,
    costPesos: line.product.costPesos,
    modifiers: line.modifiers,
    components: line.product.components
  }), 0) + (type === 'DELIVERY' ? deliveryFee : 0)
  const remaining = total - parts.reduce((sum, part) => sum + part.amountPesos, 0)

  function addLine(product: ProductRow, modifiers: ModifierRow[]) {
    setCart((current) => addToCart(current, product, modifiers))
  }

  function pick(product: ProductRow) {
    if (product.modifierGroupIds.length === 0) {
      addLine(product, [])
      return
    }
    setPicking(product)
    setSelected({})
  }

  function pickFamily(family: ProductFamily) {
    if (family.variants.length === 1) {
      pick(family.variants[0].product)
      return
    }
    setPickingFamily(family)
  }

  function chooseVariant(product: ProductRow) {
    setPickingFamily(null)
    pick(product)
  }

  function removeLine(key: string) {
    setCart((current) => current.filter((line) => line.key !== key))
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

  function openPrice(line: CartLine) {
    setPriceLine(line)
    setPriceValue(String(line.unitPricePesos))
    setPriceReason(line.overrideReason ?? '')
    setPriceError('')
  }

  function savePrice() {
    if (!priceLine) {
      return
    }
    const price = Number(priceValue)
    const reason = priceReason.trim()
    if (!Number.isInteger(price) || price < 0) {
      setPriceError('El precio debe ser un entero mayor o igual a 0')
      return
    }
    if (reason.length < 5 || reason.length > 200) {
      setPriceError('El motivo debe tener entre 5 y 200 caracteres')
      return
    }
    setCart((current) => current.map((line) => line.key === priceLine.key
      ? {
          ...line,
          unitPricePesos: price,
          overrideReason: price === line.catalogUnitPricePesos ? null : reason
        }
      : line))
    setPriceLine(null)
    setPriceError('')
  }

  function startSplit() {
    setSplitMode(true)
    setParts([{ key: crypto.randomUUID(), method, amountPesos: total }])
    setPartAmount('')
  }

  function cancelSplit() {
    setSplitMode(false)
    setParts([])
  }

  function changePartMethod(key: string, nextMethod: PaymentMethod) {
    setParts((current) => current.map((part) => part.key === key
      ? { ...part, method: nextMethod }
      : part))
  }

  function changePartAmount(key: string, value: string) {
    const amount = Number(value)
    setParts((current) => current.map((part) => part.key === key
      ? { ...part, amountPesos: Number.isFinite(amount) ? amount : 0 }
      : part))
  }

  function addPart() {
    const amount = Number(partAmount) || remaining
    if (amount <= 0) {
      return
    }
    setParts((current) => [...current, {
      key: crypto.randomUUID(), method: partMethod, amountPesos: amount
    }])
    setPartAmount('')
  }

  function removePart(key: string) {
    setParts((current) => current.filter((part) => part.key !== key))
  }

  async function runPrint(saleId: string) {
    setPrintError('')
    try {
      await (onPrint ?? ((id: string) => printReceipt(database, id)))(saleId)
    } catch {
      setPrintError('No se pudo imprimir. La venta quedó guardada.')
    }
  }

  async function onCharge() {
    const now = Date.now()
    if (submitting || now - lastCharge.current < 500 || cart.length === 0) {
      return
    }
    lastCharge.current = now
    setError('')
    setPrintError('')
    if (type === 'DINE_IN' && !tableLabel.trim()) {
      setError('La mesa necesita una etiqueta')
      return
    }
    if (splitMode && remaining !== 0) {
      setError('Los pagos no suman el total')
      return
    }
    const payments = splitMode
      ? parts.map((part) => ({ method: part.method, amountPesos: part.amountPesos }))
      : [{ method, amountPesos: total }]
    setSubmitting(true)
    try {
      const charge = onCreateSale ?? ((input: SaleInput) => createSale(database, input))
      const created = await charge({
        type,
        tableLabel: type === 'DINE_IN' ? tableLabel : null,
        deliveryFeePesos: type === 'DELIVERY' ? deliveryFee : 0,
        payments,
        items: cart.map((line) => ({
          productId: line.product.id,
          productName: line.product.name,
          categoryName: line.product.categoryName,
          quantity: line.quantity,
          unitPricePesos: line.unitPricePesos,
          catalogUnitPricePesos: line.catalogUnitPricePesos,
          overrideReason: line.overrideReason,
          costPesos: line.product.costPesos,
          modifiers: line.modifiers,
          components: line.product.components
        }))
      })
      setCart([])
      setCartOpen(false)
      setSplitMode(false)
      setParts([])
      setLastSale(created)
      void runPrint(created.saleId)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo cobrar')
    } finally {
      setSubmitting(false)
    }
  }

  const pickingGroups = picking
    ? groups.filter((group) => picking.modifierGroupIds.includes(group.id))
    : []

  function scrollToCategory(category: string) {
    if (query.trim() !== '') {
      setQuery('')
      window.requestAnimationFrame(() => scrollToCategory(category))
      return
    }
    const target = document.getElementById(categorySectionId(category))
    if (!target) {
      return
    }
    const headerHeight = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--header-height')
    ) || 0
    const toolbarHeight = toolbarRef.current?.offsetHeight ?? 0
    window.scrollTo({
      top: target.getBoundingClientRect().top + window.scrollY - headerHeight - toolbarHeight - 16,
      behavior: 'smooth'
    })
  }

  return (
    <div className="pb-24 lg:pb-0">
      <PageHeader title="Venta" subtitle="Precios congelados del catálogo local" />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div
            ref={toolbarRef}
            className="sticky top-[var(--header-height)] z-30 space-y-2 rounded-xl border border-gray-200 bg-white/95 p-4 shadow-sm backdrop-blur"
          >
            <Input
              aria-label="Buscar producto"
              placeholder="Buscar producto…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {grouped.map(([category]) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => scrollToCategory(category)}
                  className="shrink-0 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-brand-500"
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
          <Card>
            <div className="space-y-4">
              {visibleGroups.length === 0 ? (
                <p className="text-sm text-gray-500">Sin productos para esa búsqueda.</p>
              ) : null}
              {visibleGroups.map(([category, families]) => (
                <section key={category} id={categorySectionId(category)}>
                  <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                    {category}
                  </h2>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                    {families.map((family) => {
                      const price = family.variants[0]?.product.pricePesos ?? 0
                      return (
                        <button
                          key={family.key}
                          type="button"
                          onClick={() => pickFamily(family)}
                          className="flex min-h-[76px] flex-col justify-between rounded-xl border border-gray-200 p-3 text-left transition hover:border-brand-500 hover:shadow-sm active:scale-[0.99]"
                        >
                          <span className="block text-sm font-semibold text-gray-900">
                            {family.name}
                          </span>
                          <span className="mt-1 flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-brand-600">
                              {family.variants.length > 1
                                ? `Desde $${price.toLocaleString('es-CO')} · ${family.variants.length} opciones`
                                : `$${price.toLocaleString('es-CO')}`}
                            </span>
                            <span aria-hidden className="text-lg font-bold leading-none text-brand-600">
                              +
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </Card>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 p-2 shadow-[0_-8px_24px_rgba(0,0,0,0.12)] lg:sticky lg:top-[calc(var(--header-height)+1rem)] lg:z-auto lg:self-start lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg bg-gray-900 px-4 py-3 text-sm font-semibold text-white lg:hidden"
            onClick={() => setCartOpen((open) => !open)}
            aria-expanded={cartOpen}
            aria-controls="sale-cart-panel"
          >
            <span>Carrito ({cartUnits})</span>
            <span>
              ${total.toLocaleString('es-CO')} · {cartOpen ? 'Cerrar' : 'Ver'}
            </span>
          </button>

          <div
            id="sale-cart-panel"
            role="region"
            aria-label="Carrito"
            className={`${cartOpen ? 'mt-2 max-h-[70vh] overflow-y-auto' : 'hidden'} space-y-4 lg:mt-0 lg:block lg:max-h-none lg:overflow-visible`}
          >
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
                        {line.modifiers.length > 0 ? (
                          <p className="text-xs text-gray-500">
                            {line.modifiers.map((modifier) => modifier.name).join(' · ')}
                          </p>
                        ) : null}
                        <p className="text-xs text-gray-500">
                          ${(line.unitPricePesos
                            + line.modifiers.reduce((sum, m) => sum + m.additionalPricePesos, 0)
                          ).toLocaleString('es-CO')} c/u
                        </p>
                        {line.unitPricePesos !== line.catalogUnitPricePesos ? (
                          <p className="text-xs text-amber-700">
                            Precio de lista ${line.catalogUnitPricePesos.toLocaleString('es-CO')}
                          </p>
                        ) : null}
                        {canOverride ? (
                          <Button
                            variant="ghost"
                            className="mt-1 px-2 py-1 text-xs"
                            onClick={() => openPrice(line)}
                          >
                            Cambiar precio
                          </Button>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" onClick={() => changeQuantity(line.key, -1)}>-</Button>
                        <span className="w-6 text-center text-sm">{line.quantity}</span>
                        <Button variant="ghost" onClick={() => changeQuantity(line.key, 1)}>+</Button>
                        <Button
                          variant="ghost"
                          className="px-2 py-1 text-red-600"
                          aria-label={`Eliminar ${line.product.name}`}
                          onClick={() => removeLine(line.key)}
                        >
                          ×
                        </Button>
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
                {!splitMode ? (
                  <>
                    <label className="block text-sm font-medium text-gray-700">
                      Pago
                      <select
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        value={method}
                        onChange={(event) => setMethod(event.target.value as PaymentMethod)}
                      >
                        <option value="CASH">Efectivo</option>
                        <option value="CARD">Tarjeta</option>
                        <option value="BREB">Bre-B</option>
                      </select>
                    </label>
                    <Button variant="ghost" className="w-full" onClick={startSplit}
                      disabled={cart.length === 0}>
                      Dividir pago
                    </Button>
                  </>
                ) : (
                  <div className="space-y-2">
                    {parts.map((part, index) => (
                      <div key={part.key} className="flex items-end gap-2">
                        <label className="block flex-1 text-sm font-medium text-gray-700">
                          Medio
                          <select
                            aria-label={`Medio del pago ${index + 1}`}
                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            value={part.method}
                            onChange={(event) =>
                              changePartMethod(part.key, event.target.value as PaymentMethod)}
                          >
                            <option value="CASH">Efectivo</option>
                            <option value="CARD">Tarjeta</option>
                            <option value="BREB">Bre-B</option>
                          </select>
                        </label>
                        <label className="block w-28 text-sm font-medium text-gray-700">
                          Monto
                          <Input
                            aria-label={`Monto del pago ${index + 1}`}
                            className="mt-1"
                            type="number"
                            min={0}
                            value={String(part.amountPesos)}
                            onChange={(event) => changePartAmount(part.key, event.target.value)}
                          />
                        </label>
                        <Button variant="ghost" className="px-2 py-1 text-red-600"
                          aria-label={`Quitar pago ${index + 1}`}
                          onClick={() => removePart(part.key)}>
                          ×
                        </Button>
                      </div>
                    ))}
                    <p className={`text-sm ${remaining === 0 ? 'text-green-700' : 'text-amber-700'}`}>
                      Restante ${remaining.toLocaleString('es-CO')}
                    </p>
                    <div className="flex items-end gap-2">
                      <label className="block flex-1 text-sm font-medium text-gray-700">
                        Medio
                        <select
                          aria-label="Medio del nuevo pago"
                          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          value={partMethod}
                          onChange={(event) => setPartMethod(event.target.value as PaymentMethod)}
                        >
                          <option value="CASH">Efectivo</option>
                          <option value="CARD">Tarjeta</option>
                          <option value="BREB">Bre-B</option>
                        </select>
                      </label>
                      <label className="block w-28 text-sm font-medium text-gray-700">
                        Monto
                        <Input
                          aria-label="Monto del nuevo pago"
                          className="mt-1"
                          type="number"
                          min={0}
                          value={partAmount}
                          placeholder={String(Math.max(remaining, 0))}
                          onChange={(event) => setPartAmount(event.target.value)}
                        />
                      </label>
                      <Button variant="ghost" onClick={addPart}>Agregar pago</Button>
                    </div>
                    <Button variant="ghost" className="w-full" onClick={cancelSplit}>
                      Cancelar división
                    </Button>
                  </div>
                )}
                <Button className="w-full" onClick={onCharge}
                  disabled={submitting || cart.length === 0 || (splitMode && remaining !== 0)}>
                  {submitting ? 'Guardando…' : 'Cobrar'}
                </Button>
                {lastSale ? (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                    <p className="text-sm font-medium text-green-800">
                      Venta {lastSale.displayCode} guardada
                    </p>
                    <Button
                      variant="secondary"
                      className="mt-2 w-full"
                      onClick={() => void runPrint(lastSale.saleId)}
                    >
                      Imprimir comprobante
                    </Button>
                  </div>
                ) : null}
                {printError ? <p className="text-sm text-red-600">{printError}</p> : null}
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
              </div>
            </Card>
          </div>
        </div>
      </div>

      {priceLine ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <h2 className="mb-3 font-semibold text-gray-900">
              Cambiar precio de {priceLine.product.name}
            </h2>
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Precio unitario
                <Input className="mt-1" type="number" min={0} value={priceValue}
                  onChange={(event) => setPriceValue(event.target.value)} />
              </label>
              <p className="text-xs text-gray-500">
                Precio de lista ${priceLine.catalogUnitPricePesos.toLocaleString('es-CO')}
              </p>
              <label className="block text-sm font-medium text-gray-700">
                Motivo
                <Input className="mt-1" maxLength={200} value={priceReason}
                  onChange={(event) => setPriceReason(event.target.value)} />
              </label>
              {priceError ? <p className="text-sm text-red-600">{priceError}</p> : null}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setPriceLine(null)}>Cancelar</Button>
                <Button onClick={savePrice}>Guardar precio</Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {pickingFamily ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <h2 className="mb-1 font-semibold text-gray-900">{pickingFamily.name}</h2>
            <p className="mb-3 text-sm text-gray-500">Elige la presentación</p>
            <div className="grid grid-cols-2 gap-2">
              {pickingFamily.variants.map((variant) => (
                <button
                  key={variant.product.id}
                  type="button"
                  onClick={() => chooseVariant(variant.product)}
                  className="rounded-lg border border-gray-200 p-3 text-left hover:border-brand-500"
                >
                  <span className="block text-sm font-semibold text-gray-900">
                    {variant.label}
                  </span>
                  <span className="text-sm text-brand-600">
                    ${variant.product.pricePesos.toLocaleString('es-CO')}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" onClick={() => setPickingFamily(null)}>Cancelar</Button>
            </div>
          </Card>
        </div>
      ) : null}

      {picking ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
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
