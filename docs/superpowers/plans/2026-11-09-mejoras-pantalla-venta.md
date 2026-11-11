# Mejoras de la pantalla de venta — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repetir un producto suma unidades en la misma línea y la pantalla de venta permite encontrar productos por categoría o nombre sin ocultar el catálogo.

**Architecture:** La regla de fusión del carrito sale a un módulo puro (`cart-lines.ts`) para probarla sin montar React. `SaleScreen` solo la invoca desde `addLine`. Los chips de categoría saltan a secciones que siguen todas renderizadas; el buscador filtra familias en memoria. No hay cambios de datos ni de red.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Dexie, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-09-mejoras-pantalla-venta-design.md`

## Global Constraints

- Sin dependencias nuevas.
- Se conservan precios congelados, cambio de precio autorizado, pagos divididos y turnos.
- Todo el texto visible va en español.
- Comandos desde `frontend/`; `npm test` y `npm run build` deben terminar sin errores.
- No se reordena el catálogo: se conserva el orden actual de categorías y productos.

## Review Focus

- Repetir un producto con precio cambiado a mano debe crear una línea nueva al precio de catálogo, no aplicar el precio especial a la unidad nueva.
- Elegir modificadores distintos para el mismo producto debe dejar líneas separadas; los mismos modificadores en otro orden deben fusionarse.
- Repetir un producto ya en 99 unidades no debe pasar el tope.
- Buscar `pina` debe encontrar `PIÑA COLADA` (sin distinguir mayúsculas ni tildes).
- Una búsqueda sin coincidencias debe avisar y no dejar secciones vacías.

---

### Task 1: Fusionar líneas repetidas del carrito

**Files:**
- Create: `frontend/src/modules/sales/cart-lines.ts`
- Create: `frontend/src/modules/sales/cart-lines.test.ts`
- Modify: `frontend/src/modules/sales/SaleScreen.tsx:11-19` (mover `CartLine` al nuevo módulo)
- Modify: `frontend/src/modules/sales/SaleScreen.tsx:95-108` (`addLine` usa `addToCart`)
- Modify: `frontend/src/modules/sales/SaleScreen.test.tsx`

**Interfaces:**
- Consumes: `ProductRow` y `ModifierRow` de `frontend/src/infrastructure/database/schema.ts`.
- Produces: `CartLine` con los mismos campos que hoy (`key`, `product`, `quantity`, `unitPricePesos`, `catalogUnitPricePesos`, `overrideReason`, `modifiers`) y `addToCart(cart: CartLine[], product: ProductRow, modifiers: ModifierRow[]): CartLine[]`.
- Regla: fusiona solo si coinciden `product.id` y el conjunto de IDs de modificadores y la línea tiene `overrideReason === null`. Cantidad máxima 99.

- [ ] **Step 1: Write the failing unit tests**

Create `frontend/src/modules/sales/cart-lines.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ModifierRow, ProductRow } from '../../infrastructure/database/schema'
import { addToCart, type CartLine } from './cart-lines'

const product: ProductRow = {
  id: 'p1',
  name: 'SENCILLA',
  categoryName: 'HAMBURGUESAS',
  kind: 'PRODUCT',
  pricePesos: 16500,
  costPesos: null,
  sortOrder: 1,
  active: true,
  modifierGroupIds: [],
  components: []
}

const modifier = (id: string): ModifierRow => ({
  id,
  name: id,
  additionalPricePesos: 0
})

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    key: crypto.randomUUID(),
    product,
    quantity: 1,
    unitPricePesos: 16500,
    catalogUnitPricePesos: 16500,
    overrideReason: null,
    modifiers: [],
    ...overrides
  }
}

describe('addToCart', () => {
  it('suma cantidad cuando coinciden producto y modificadores', () => {
    const first = addToCart([], product, [modifier('m1')])
    const result = addToCart(first, product, [modifier('m1')])

    expect(result).toHaveLength(1)
    expect(result[0].quantity).toBe(2)
  })

  it('fusiona aunque los modificadores lleguen en otro orden', () => {
    const first = addToCart([], product, [modifier('m1'), modifier('m2')])
    const result = addToCart(first, product, [modifier('m2'), modifier('m1')])

    expect(result).toHaveLength(1)
    expect(result[0].quantity).toBe(2)
  })

  it('mantiene líneas separadas con modificadores distintos', () => {
    const first = addToCart([], product, [modifier('m1')])
    const result = addToCart(first, product, [modifier('m2')])

    expect(result).toHaveLength(2)
    expect(result.map((item) => item.quantity)).toEqual([1, 1])
  })

  it('no fusiona una línea con precio cambiado y usa el precio de catálogo', () => {
    const changed = line({ overrideReason: 'descuento', unitPricePesos: 15000 })
    const result = addToCart([changed], product, [])

    expect(result).toHaveLength(2)
    expect(result[1].unitPricePesos).toBe(16500)
    expect(result[1].overrideReason).toBeNull()
  })

  it('no pasa de 99 unidades', () => {
    const result = addToCart([line({ quantity: 99 })], product, [])

    expect(result[0].quantity).toBe(99)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/modules/sales/cart-lines.test.ts`
Expected: FAIL because `./cart-lines` does not exist.

- [ ] **Step 3: Implement `cart-lines.ts`**

Create `frontend/src/modules/sales/cart-lines.ts`:

```ts
import type { ModifierRow, ProductRow } from '../../infrastructure/database/schema'

const MAX_QUANTITY = 99

export interface CartLine {
  key: string
  product: ProductRow
  quantity: number
  unitPricePesos: number
  catalogUnitPricePesos: number
  overrideReason: string | null
  modifiers: ModifierRow[]
}

function sameModifiers(left: ModifierRow[], right: ModifierRow[]): boolean {
  const leftIds = left.map((modifier) => modifier.id).sort()
  const rightIds = right.map((modifier) => modifier.id).sort()
  return leftIds.length === rightIds.length &&
    leftIds.every((id, index) => id === rightIds[index])
}

export function addToCart(
  cart: CartLine[],
  product: ProductRow,
  modifiers: ModifierRow[]
): CartLine[] {
  const existing = cart.find((line) =>
    line.product.id === product.id &&
    line.overrideReason === null &&
    sameModifiers(line.modifiers, modifiers)
  )
  if (existing) {
    return cart.map((line) => line.key === existing.key
      ? { ...line, quantity: Math.min(MAX_QUANTITY, line.quantity + 1) }
      : line)
  }
  return [...cart, {
    key: crypto.randomUUID(),
    product,
    quantity: 1,
    unitPricePesos: product.pricePesos,
    catalogUnitPricePesos: product.pricePesos,
    overrideReason: null,
    modifiers
  }]
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/modules/sales/cart-lines.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing screen test**

Append to `frontend/src/modules/sales/SaleScreen.test.tsx`:

```ts
it('un segundo clic sobre el mismo producto suma cantidad en la misma línea', async () => {
  const db = openDb(`test-screen-${crypto.randomUUID()}`)
  opened.push(db)
  await db.products.put({
    id: 'p1',
    name: 'SENCILLA',
    categoryName: 'HAMBURGUESAS',
    kind: 'PRODUCT',
    pricePesos: 16500,
    costPesos: null,
    sortOrder: 1,
    active: true,
    modifierGroupIds: [],
    components: []
  })

  renderScreen({ database: db })
  const product = await screen.findByRole('button', { name: /sencilla/i })
  await userEvent.click(product)
  await userEvent.click(product)

  const cart = screen.getByRole('region', { name: 'Carrito' })
  expect(within(cart).getAllByText('SENCILLA')).toHaveLength(1)
  expect(within(cart).getByText('2')).toBeInTheDocument()
  expect(within(cart).getByText(/total \$33\.000/i)).toBeInTheDocument()
})
```

- [ ] **Step 6: Run the screen test to verify it fails**

Run: `cd frontend && npx vitest run src/modules/sales/SaleScreen.test.tsx -t "segundo clic"`
Expected: FAIL because the cart shows two `SENCILLA` lines and quantity 1.

- [ ] **Step 7: Wire `addToCart` into `SaleScreen.tsx`**

- Import `addToCart` and `type CartLine` from `./cart-lines`; delete the local `interface CartLine`.
- Replace the body of `addLine` with:

```ts
function addLine(product: ProductRow, modifiers: ModifierRow[]) {
  setCart((current) => addToCart(current, product, modifiers))
}
```

- [ ] **Step 8: Run the tests and build**

Run: `cd frontend && npm test`
Expected: PASS (all suites).
Run: `cd frontend && npm run build`
Expected: build correcto, sin errores de TypeScript.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/modules/sales/cart-lines.ts frontend/src/modules/sales/cart-lines.test.ts frontend/src/modules/sales/SaleScreen.tsx frontend/src/modules/sales/SaleScreen.test.tsx
git commit -m "fix: suma unidades al repetir un producto en la venta"
```

---

### Task 2: Navegación por categorías, búsqueda y carrito más claro

**Files:**
- Modify: `frontend/src/modules/sales/SaleScreen.tsx`
- Modify: `frontend/src/modules/sales/SaleScreen.test.tsx`

**Interfaces:**
- Consumes: `grouped` (`[categoryName, ProductFamily[]][]`) y `buildProductFamilies` ya existentes; `CartLine.modifiers`.
- Produces: nada exportado; solo cambia el render de `SaleScreen`.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/modules/sales/SaleScreen.test.tsx`:

```ts
it('filtra por nombre sin distinguir mayúsculas ni tildes', async () => {
  const db = openDb(`test-screen-${crypto.randomUUID()}`)
  opened.push(db)
  await db.products.bulkPut([
    {
      id: 'p1',
      name: 'PIÑA COLADA',
      categoryName: 'BEBIDAS',
      kind: 'PRODUCT',
      pricePesos: 14500,
      costPesos: null,
      sortOrder: 1,
      active: true,
      modifierGroupIds: [],
      components: []
    },
    {
      id: 'p2',
      name: 'SENCILLA',
      categoryName: 'HAMBURGUESAS',
      kind: 'PRODUCT',
      pricePesos: 16500,
      costPesos: null,
      sortOrder: 1,
      active: true,
      modifierGroupIds: [],
      components: []
    }
  ])

  renderScreen({ database: db })
  await screen.findByRole('button', { name: /piña colada/i })
  await userEvent.type(screen.getByLabelText(/buscar producto/i), 'pina')

  expect(screen.getByRole('button', { name: /piña colada/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /sencilla/i })).not.toBeInTheDocument()
})

it('avisa cuando la búsqueda no tiene coincidencias', async () => {
  const db = openDb(`test-screen-${crypto.randomUUID()}`)
  opened.push(db)
  await db.products.put({
    id: 'p1',
    name: 'SENCILLA',
    categoryName: 'HAMBURGUESAS',
    kind: 'PRODUCT',
    pricePesos: 16500,
    costPesos: null,
    sortOrder: 1,
    active: true,
    modifierGroupIds: [],
    components: []
  })

  renderScreen({ database: db })
  await screen.findByRole('button', { name: /sencilla/i })
  await userEvent.type(screen.getByLabelText(/buscar producto/i), 'zzz')

  expect(screen.getByText(/sin productos/i)).toBeInTheDocument()
})

it('muestra los modificadores elegidos en el carrito', async () => {
  const db = openDb(`test-screen-${crypto.randomUUID()}`)
  opened.push(db)
  await db.modifierGroups.put({
    id: 'g1',
    name: 'EXTRAS',
    minSelection: 0,
    maxSelection: 1,
    modifiers: [{ id: 'm1', name: 'Extra queso', additionalPricePesos: 2000 }]
  })
  await db.products.put({
    id: 'p1',
    name: 'SENCILLA',
    categoryName: 'HAMBURGUESAS',
    kind: 'PRODUCT',
    pricePesos: 16500,
    costPesos: null,
    sortOrder: 1,
    active: true,
    modifierGroupIds: ['g1'],
    components: []
  })

  renderScreen({ database: db })
  await userEvent.click(await screen.findByRole('button', { name: /sencilla/i }))
  await userEvent.click(screen.getByLabelText(/extra queso/i))
  await userEvent.click(screen.getByRole('button', { name: /^agregar$/i }))

  const cart = screen.getByRole('region', { name: 'Carrito' })
  expect(within(cart).getByText(/extra queso/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/modules/sales/SaleScreen.test.tsx -t "filtra por nombre"`
Expected: FAIL because there is no `Buscar producto` field.
Run: the other two test names the same way; expected FAIL for each.

- [ ] **Step 3: Add search state and filtering**

At module level in `SaleScreen.tsx`:

```ts
function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-CO')
}
```

Inside the component, after `grouped`:

```ts
const [query, setQuery] = useState('')
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
```

- [ ] **Step 4: Render search, category chips and filtered sections**

- Render an `Input` with `aria-label="Buscar producto"`, placeholder `Buscar producto…`, `value={query}` and `onChange` that calls `setQuery`.
- Above the sections, when `query.trim() === ''`, render one chip button per `grouped` category:

```tsx
<button
  key={category}
  type="button"
  onClick={() => document
    .getElementById(`category-${normalizeSearch(category).replace(/[^a-z0-9]+/g, '-')}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
  className="shrink-0 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-brand-500"
>
  {category}
</button>
```

- Each `<section>` gets the same `id` helper and `className="scroll-mt-4"`.
- Iterate `visibleGroups` instead of `grouped`.
- If `visibleGroups.length === 0`, render `<p className="text-sm text-gray-500">Sin productos para esa búsqueda.</p>`.

- [ ] **Step 5: Show modifiers in the cart and enlarge the product cards**

- Under the product name in each cart line, add:

```tsx
{line.modifiers.length > 0 ? (
  <p className="text-xs text-gray-500">
    {line.modifiers.map((modifier) => modifier.name).join(' · ')}
  </p>
) : null}
```

- Replace the product card classes with `flex min-h-[76px] flex-col justify-between rounded-xl border border-gray-200 p-3 text-left transition hover:border-brand-500 hover:shadow-sm active:scale-[0.99]` and render a `+` on the price row:

```tsx
<span className="mt-1 flex items-center justify-between gap-2">
  <span className="text-sm font-medium text-brand-600">
    {/* Se conserva el texto actual: precio o "Desde $… · N opciones" */}
  </span>
  <span aria-hidden className="text-lg font-bold leading-none text-brand-600">+</span>
</span>
```

- [ ] **Step 6: Run the tests and build**

Run: `cd frontend && npm test`
Expected: PASS (all suites).
Run: `cd frontend && npm run build`
Expected: build correcto.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/modules/sales/SaleScreen.tsx frontend/src/modules/sales/SaleScreen.test.tsx
git commit -m "feat: navegacion por categorias y busqueda en la venta"
```

---

## Verificación final

- [ ] `cd frontend && npm test` → todas las suites en verde.
- [ ] `cd frontend && npm run build` → sin errores.
- [ ] Manual: agregar dos veces `COMBO 2` deja una línea con cantidad 2; filtrar `pina` encuentra `PIÑA COLADA`; los chips saltan a su categoría.
