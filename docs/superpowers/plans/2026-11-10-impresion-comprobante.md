# Impresión de comprobante para el cliente — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Imprimir automáticamente un comprobante de venta en la impresora térmica al cobrar, con reimpresión manual desde Pedidos, sin que un fallo de impresión afecte la venta.

**Architecture:** Se arma el comprobante como HTML a partir de IndexedDB y se imprime con `window.print()` sobre un `iframe` oculto. La venta ya quedó guardada antes de imprimir; cualquier error de impresión solo muestra un aviso. No hay cambios de backend ni dependencias nuevas.

**Tech Stack:** React 18, TypeScript, Vite, Dexie/IndexedDB, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-10-impresion-comprobante-design.md`

## Global Constraints

- Todo el contenido del comprobante sale de IndexedDB; la impresión debe funcionar sin internet.
- No agregar dependencias ni tocar el backend.
- No emitir factura electrónica, NIT, resolución DIAN ni numeración fiscal.
- La venta nunca se revierte ni se bloquea por un error de impresión.
- El diálogo de impresión se lanza automáticamente al cobrar y además queda el botón **Imprimir comprobante**.
- Título del papel: **Comprobante de venta**.
- Montos con `toLocaleString('es-CO')`; fechas en `America/Bogota`.
- Texto dinámico escapado antes de insertarse en HTML.
- Objetivo de hardware: PC de caja con Windows y Edge/Chrome. Las tablets Android no son requisito de esta iteración.
- Interfaz en español; pruebas con `npm test` y compilación con `npm run build`.

## Review Focus

- **Impresora apagada o sin driver:** la venta debe quedar guardada, mostrarse el aviso y el botón de reimpresión debe seguir funcionando.
- **Tirilla de 58 mm o nombres largos:** el texto debe envolver, sin cortes horizontales, y el total debe quedar visible.
- **Sede sin cachear:** el comprobante no puede quedar sin encabezado; debe usar el código del dispositivo.
- **Nombres, notas o modificadores con `<`, `>`, `&` o comillas:** no deben romper el HTML ni ejecutar contenido.
- **Pago dividido, domicilio con envío y mesa:** cada dato debe aparecer una sola vez y el total no debe duplicarse.

---

### Task 1: Datos y HTML del comprobante

**Files:**
- Create: `frontend/src/modules/printing/receipt.ts`
- Create: `frontend/src/modules/printing/receipt.test.ts`
- Modify: `frontend/src/infrastructure/database/schema.ts`
- Modify: `frontend/src/application/use-cases/sales/create-sale.ts`
- Modify: `frontend/src/application/use-cases/sales/create-sale.test.ts`
- Modify: `frontend/src/modules/admin/SettingsScreen.tsx`

**Interfaces:**
- Consumes: `CajaDb`, `SaleRow`, `SaleItemRow`, `PaymentRow` de `../../infrastructure/database/schema`.
- Produces:
  - `export interface ReceiptData { sale: SaleRow; items: SaleItemRow[]; payments: PaymentRow[]; cashierName: string; locationName: string | null; deviceCode: string | null }`
  - `export async function loadReceiptData(database: CajaDb, saleId: string): Promise<ReceiptData>`
  - `export function buildReceiptHtml(data: ReceiptData): string`

- [ ] **Step 1: Escribir las pruebas que fallan**

En `receipt.test.ts`, definir un fixture `ReceiptData` con una venta `DELIVERY` de `$23.000` (dos unidades de `$8.000` con modificador `Queso +$1.000`, envío `$5.000`), pagos divididos (`CASH $10.000`, `CARD $13.000`), cajero `ana`, sede `Almendros` y código `ALM-A`.

```ts
it('incluye el detalle, los pagos y la sede', () => {
  const html = buildReceiptHtml(data())
  for (const text of [
    'KARBÓN', 'Almendros', 'Comprobante de venta', 'ALM-A-000123',
    'SENCILLA', '2 x', '+ Queso', 'Nota: Sin cebolla', 'Envío',
    '$5.000', 'Total', '$23.000', 'Efectivo', '$10.000', 'Tarjeta', '$13.000'
  ]) {
    expect(html).toContain(text)
  }
})

it('escapa el texto dinámico', () => {
  const html = buildReceiptHtml(data({
    items: [item({ productName: '<script>alert(1)</script>' })]
  }))
  expect(html).not.toContain('<script>')
  expect(html).toContain('&lt;script&gt;')
})

it('usa el código del dispositivo cuando no hay sede', () => {
  const html = buildReceiptHtml(data({ locationName: null, deviceCode: 'ALM-A' }))
  expect(html).toContain('ALM-A')
  expect(html).not.toContain('Almendros')
})

it('muestra la mesa y no imprime envío si no aplica', () => {
  const html = buildReceiptHtml(data({
    sale: sale({ type: 'DINE_IN', tableLabel: 'Mesa 4', deliveryFeePesos: 0, totalPesos: 18000 })
  }))
  expect(html).toContain('Mesa 4')
  expect(html).not.toContain('Envío')
})

it('carga la venta, las líneas en orden y el cajero', async () => {
  const db = openDb(`test-receipt-${crypto.randomUUID()}`)
  opened.push(db)
  await db.users.put({ id: 'u1', username: 'ana', role: 'CASHIER' })
  await db.sales.put(sale())
  await db.saleItems.bulkPut([
    item({ id: 'i2', productName: 'PAPAS', lineNumber: 2 }),
    item({ id: 'i1', lineNumber: 1 })
  ])
  await db.payments.bulkPut([
    { id: 'pay1', saleId: 's1', method: 'CASH', amountPesos: 10000 },
    { id: 'pay2', saleId: 's1', method: 'CARD', amountPesos: 13000 }
  ])
  await db.meta.put({ key: 'locationName', value: 'Almendros' })
  await db.meta.put({ key: 'devicePrefix', value: 'ALM-A' })

  const out = await loadReceiptData(db, 's1')

  expect(out.cashierName).toBe('ana')
  expect(out.locationName).toBe('Almendros')
  expect(out.items.map((row) => row.productName)).toEqual(['SENCILLA', 'PAPAS'])
  expect(out.payments).toHaveLength(2)
})
```

En `create-sale.test.ts`, agregar:

```ts
it('guarda nota y orden de línea para el comprobante', async () => {
  const db = await seed()
  const input = baseInput()
  input.items[0].note = 'Sin cebolla'

  const out = await createSale(db, input)
  const stored = await db.saleItems.where('saleId').equals(out.saleId).first()

  expect(stored?.note).toBe('Sin cebolla')
  expect(stored?.lineNumber).toBe(1)
})
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `cd frontend && npm test -- receipt.test.ts create-sale.test.ts`

Expected: FAIL. `receipt.ts` no existe y `note`/`lineNumber` no están en `SaleItemRow`.

- [ ] **Step 3: Implementar `receipt.ts`**

- Agregar `note?: string | null` y `lineNumber?: number` a `SaleItemRow` en `schema.ts`.
- En `create-sale.ts`, al hacer `saleItems.bulkAdd`, incluir `note: item.note ?? null` y `lineNumber: index + 1` (usar el índice del `map`).
- `loadReceiptData`: leer la venta (error `La venta no existe` si falta), sus líneas por `saleId`, sus pagos y el usuario de `sale.userId`. Leer `meta.locationName` y `meta.devicePrefix` como texto o `null`. Ordenar las líneas por `lineNumber` ascendente; las que no lo tengan van al final conservando el orden de Dexie.
- `buildReceiptHtml`: generar un documento HTML completo con:
  - `@page { margin: 2mm }`, ancho fluido, fuente del sistema, base de 12 px, separadores punteados y sin recursos externos.
  - Encabezado `KARBÓN`; debajo el nombre de la sede o, si no existe, `deviceCode`.
  - `Comprobante de venta`, código, fecha/hora en Bogotá, tipo (`Mostrador`, `Domicilio` o `Mesa <etiqueta>`) y cajero.
  - Líneas: `cantidad x producto` y total de línea a la derecha; debajo cada modificador como `+ nombre $precio` y la nota como `Nota: texto`.
  - `Envío` solo si `deliveryFeePesos > 0`.
  - `Total` y luego cada pago con su medio (`Efectivo`, `Tarjeta`, `Bre-B`) y monto.
  - Pie `Gracias por su visita`.
- Escapar todo texto dinámico con una función local que reemplace `&`, `<`, `>`, `"` y `'`.
- En `SettingsScreen.refresh`, después de `setCode(current.code)`, guardar `db.meta.put({ key: 'locationName', value: current.name })` para que el encabezado funcione offline.

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `cd frontend && npm test -- receipt.test.ts create-sale.test.ts`

Expected: PASS.

- [ ] **Step 5: Correr toda la suite**

Run: `cd frontend && npm test`

Expected: PASS, sin regresiones.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/modules/printing frontend/src/infrastructure/database/schema.ts frontend/src/application/use-cases/sales frontend/src/modules/admin/SettingsScreen.tsx
git commit -m "feat: construir comprobante de venta desde datos locales"
```

---

### Task 2: Impresión automática y botón en Venta

**Files:**
- Modify: `frontend/src/modules/printing/receipt.ts`
- Modify: `frontend/src/modules/sales/SaleScreen.tsx`
- Modify: `frontend/src/modules/sales/SaleScreen.test.tsx`

**Interfaces:**
- Consumes: `loadReceiptData`, `buildReceiptHtml` de Task 1.
- Produces:
  - `export async function printReceipt(database: CajaDb, saleId: string): Promise<void>`
  - `SaleScreenProps.onPrint?: (saleId: string) => Promise<void>`

- [ ] **Step 1: Escribir las pruebas que fallan**

En `SaleScreen.test.tsx`, cambiar el helper para inyectar una impresión no-op por defecto:

```tsx
function renderScreen(props: ComponentProps<typeof SaleScreen>) {
  return render(
    <AuthProvider>
      <SaleScreen onPrint={vi.fn()} {...props} />
    </AuthProvider>
  )
}
```

Agregar:

```tsx
it('imprime automáticamente al cobrar y permite reimprimir', async () => {
  const db = openDb(`test-screen-${crypto.randomUUID()}`)
  opened.push(db)
  await db.products.put({
    id: 'p1', name: 'SENCILLA', categoryName: 'HAMBURGUESAS', kind: 'PRODUCT',
    pricePesos: 16500, costPesos: null, sortOrder: 1, active: true,
    modifierGroupIds: [], components: []
  })
  const create = vi.fn().mockResolvedValue({
    saleId: 's1', displayCode: 'ALM-A-000001', totalPesos: 16500
  })
  const print = vi.fn().mockResolvedValue(undefined)

  renderScreen({ database: db, onCreateSale: create, onPrint: print })
  await userEvent.click(await screen.findByRole('button', { name: /sencilla/i }))
  await userEvent.click(screen.getByRole('button', { name: /cobrar/i }))

  expect(print).toHaveBeenCalledWith('s1')
  await userEvent.click(await screen.findByRole('button', { name: /imprimir comprobante/i }))
  expect(print).toHaveBeenCalledTimes(2)
})

it('avisa si falla la impresión y conserva la venta', async () => {
  const db = openDb(`test-screen-${crypto.randomUUID()}`)
  opened.push(db)
  await db.products.put({
    id: 'p1', name: 'SENCILLA', categoryName: 'HAMBURGUESAS', kind: 'PRODUCT',
    pricePesos: 16500, costPesos: null, sortOrder: 1, active: true,
    modifierGroupIds: [], components: []
  })
  const create = vi.fn().mockResolvedValue({
    saleId: 's1', displayCode: 'ALM-A-000001', totalPesos: 16500
  })
  const print = vi.fn().mockRejectedValue(new Error('sin impresora'))

  renderScreen({ database: db, onCreateSale: create, onPrint: print })
  await userEvent.click(await screen.findByRole('button', { name: /sencilla/i }))
  await userEvent.click(screen.getByRole('button', { name: /cobrar/i }))

  expect(await screen.findByText(/no se pudo imprimir/i)).toBeInTheDocument()
  expect(screen.getByText(/venta alm-a-000001 guardada/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `cd frontend && npm test -- SaleScreen.test.tsx`

Expected: FAIL. `onPrint` no existe y no aparece el botón.

- [ ] **Step 3: Implementar `printReceipt` y conectar la Venta**

- `printReceipt`: cargar datos, construir el HTML, crear un `iframe` oculto (`position: fixed`, `width: 0`, `height: 0`, `border: 0`, `visibility: hidden`), asignar `srcdoc`, y en `onload` llamar `contentWindow.focus()` y `contentWindow.print()`. Quitar el iframe al evento `afterprint` y, como respaldo, a los 60 segundos. Rechazar si no hay `contentWindow` y limpiar el iframe en cualquier error.
- En `SaleScreen`:
  - Agregar la prop `onPrint?: (saleId: string) => Promise<void>`.
  - Reemplazar el estado `message` por `lastSale: CreatedSale | null` y agregar `printError`.
  - En el éxito de `onCharge`: `setLastSale(created)` y lanzar `void runPrint(created.saleId)`.
  - `runPrint` limpia `printError`, usa `onPrint ?? ((id) => printReceipt(database, id))` y, si falla, deja `No se pudo imprimir. La venta quedó guardada.`.
  - En el panel del carrito, reemplazar el párrafo de `message` por un bloque con `Venta <código> guardada`, un botón `Imprimir comprobante` que llama `void runPrint(lastSale.saleId)` y el `printError` en rojo.
- Limpiar `printError` al iniciar un nuevo cobro.

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `cd frontend && npm test -- SaleScreen.test.tsx`

Expected: PASS.

- [ ] **Step 5: Correr toda la suite**

Run: `cd frontend && npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/modules/printing/receipt.ts frontend/src/modules/sales
git commit -m "feat: imprimir comprobante al cobrar y permitir reimpresión"
```

---

### Task 3: Reimpresión desde Pedidos

**Files:**
- Modify: `frontend/src/modules/refunds/RefundScreen.tsx`
- Modify: `frontend/src/modules/refunds/RefundScreen.test.tsx`

**Interfaces:**
- Consumes: `printReceipt` de Task 2.
- Produces: `RefundScreen.onPrint?: (saleId: string) => Promise<void>`.

- [ ] **Step 1: Escribir la prueba que falla**

```tsx
import userEvent from '@testing-library/user-event'

it('reimprime una venta desde Pedidos', async () => {
  await db.sales.put({
    id: 's1', displayCode: 'ALM-A-000001', status: 'CHARGED', totalPesos: 16500,
    type: 'COUNTER', method: 'CASH', operationalDate: '2026-11-07',
    createdAt: '2026-11-07T15:00:00.000Z', shiftId: 'shift-1', userId: 'u1',
    deliveryFeePesos: 0
  })
  const print = vi.fn().mockResolvedValue(undefined)

  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <RefundScreen onPrint={print} />
    </MemoryRouter>
  )

  await userEvent.click(await screen.findByRole('button', { name: /imprimir alm-a-000001/i }))
  expect(print).toHaveBeenCalledWith('s1')
})
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `cd frontend && npm test -- RefundScreen.test.tsx`

Expected: FAIL. La prop y el botón no existen.

- [ ] **Step 3: Implementar el botón**

- Agregar `onPrint?: (saleId: string) => Promise<void>` a las props de `RefundScreen`.
- Agregar `printError` y un handler `onPrintSale` que use `printReceipt(db, saleId)` por defecto y muestre `No se pudo imprimir. La venta sigue registrada.` si falla.
- En cada fila, junto a `Devolver`, agregar un botón `Imprimir` con `aria-label={`Imprimir ${sale.displayCode}`}` que llame `void onPrintSale(sale.id)`.
- Mostrar `printError` debajo de la tabla o en el panel lateral.

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `cd frontend && npm test -- RefundScreen.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/refunds
git commit -m "feat: reimprimir comprobante desde pedidos"
```

---

### Task 4: Verificación final y documentación

**Files:**
- Modify: `docs/estado.md`

- [ ] **Step 1: Correr la verificación automatizada**

Run:

```bash
cd frontend && npm test
npm run build
```

Expected: todas las pruebas pasan y el build termina sin errores de TypeScript.

- [ ] **Step 2: Probar en el PC del local (humano)**

Con la impresora térmica instalada en Windows:

1. Abrir la caja en Edge, iniciar sesión y abrir turno.
2. Cobrar una venta de mostrador. Debe aparecer el diálogo de impresión automáticamente.
3. Elegir la impresora térmica e imprimir.
4. Revisar: encabezado, código, fecha, líneas, total y medio de pago legibles; sin cortes horizontales; la tirilla avanza y corta según la impresora.
5. En otra venta, cancelar el diálogo y pulsar **Imprimir comprobante**; debe abrirse de nuevo.
6. Ir a Pedidos, pulsar **Imprimir** en una venta; debe salir el mismo comprobante.
7. Apagar la impresora, cobrar otra venta; la venta debe quedar guardada y aparecer el aviso. Encenderla y reimprimir.

Si el texto se corta en 58 mm, ajustar el CSS de `buildReceiptHtml` (tamaño de fuente o `word-break`) y repetir la prueba.

- [ ] **Step 3: Actualizar `docs/estado.md`**

Agregar una sección breve “Impresión de comprobante (2026-11-10)” con: qué se implementó, comandos de verificación y resultado de la prueba manual. Si la prueba manual queda pendiente, registrarla como pendiente con el modelo de impresora.

- [ ] **Step 4: Commit**

```bash
git add docs/estado.md
git commit -m "docs: estado de la impresión de comprobante"
```
