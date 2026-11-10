# Pedidos: detalle y devolución segura — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir ver el detalle completo de un pedido, buscar y paginar el historial, y devolver o reimprimir solo desde el detalle.

**Architecture:** La pantalla `/orders` mantiene la lista a la izquierda y usa el panel lateral existente para un nuevo `OrderDetailPanel`. Todo sale de IndexedDB; no hay llamadas nuevas al servidor. La validación del motivo de devolución se aplica en el caso de uso local y en el backend.

**Tech Stack:** React 18 + TypeScript + Vite + Dexie + Tailwind + Vitest; Spring Boot + JdbcTemplate + JUnit/Testcontainers.

**Spec:** `docs/superpowers/specs/2026-11-10-pedidos-detalle-design.md`

## Global Constraints

- Sin dependencias nuevas.
- Pedidos sigue siendo offline: solo `sales`, `saleItems`, `payments`, `refunds`, `users` locales; ninguna llamada a `/api/**`.
- Interfaz en español, dinero con `$` y `toLocaleString('es-CO')`, fechas en `America/Bogota`.
- Reutilizar `Button`, `Card`, `Input`, `PageHeader` de `frontend/src/shared/ui/index.tsx`.
- Reutilizar `loadReceiptData` de `frontend/src/modules/printing/receipt.ts`.
- Cada tarea termina con sus pruebas verdes y un commit propio.
- No se imprime ni se devuelve nada desde la fila de la lista; solo desde el detalle.

## Review Focus

- Venta sin filas en `payments` (datos antiguos): el detalle debe caer al `sale.method` y no mostrar la sección vacía.
- Venta `REFUNDED` sin fila en `refunds`: el detalle no debe romperse; muestra el estado y omite el bloque de devolución.
- Motivo con menos de 5 caracteres, solo espacios o sin turno abierto: la devolución se rechaza y la venta sigue `CHARGED`.
- Día por defecto vs. **Ver todo**, búsqueda sin resultados y filtro de estado: sin filas fantasma ni resumen incorrecto.
- Más de 50 pedidos: **Cargar más** aparece solo cuando hay más y desaparece al mostrar todo.

---

### Task 1: Validar el motivo de devolución en el caso de uso local

**Files:**
- Modify: `frontend/src/application/use-cases/refunds/refund-sale.ts:26-29`
- Test: `frontend/src/application/use-cases/refunds/refund-sale.test.ts`

**Interfaces:**
- Consumes: `refundSale(input, database)` existente.
- Produces: `refundSale` lanza `Error('El motivo debe tener entre 5 y 200 caracteres')` cuando el motivo recortado no cumple.

- [ ] **Step 1: Escribir la prueba que falla**

Añadir a `refund-sale.test.ts`:

```ts
it('exige un motivo de entre 5 y 200 caracteres', async () => {
  const db = await seedPaidSale(16500)

  await expect(refundSale(
    { saleId: 'sale-1', reason: '    ', method: 'CASH', userId: 'u1' }, db
  )).rejects.toThrow('El motivo debe tener entre 5 y 200 caracteres')
  await expect(refundSale(
    { saleId: 'sale-1', reason: 'abcd', method: 'CASH', userId: 'u1' }, db
  )).rejects.toThrow('El motivo debe tener entre 5 y 200 caracteres')

  await expect(refundSale(
    { saleId: 'sale-1', reason: 'abcde', method: 'CASH', userId: 'u1' }, db
  )).resolves.toMatchObject({ amountPesos: 16500 })
})
```

- [ ] **Step 2: Ejecutar la prueba y verificar que falla**

Run: `cd frontend && npx vitest run src/application/use-cases/refunds/refund-sale.test.ts`
Expected: FAIL porque `'abcd'` se acepta.

- [ ] **Step 3: Implementar la validación**

En `refund-sale.ts`, después de `const reason = input.reason.trim()`:

```ts
if (reason.length < 5 || reason.length > 200) {
  throw new Error('El motivo debe tener entre 5 y 200 caracteres')
}
```

- [ ] **Step 4: Ejecutar la prueba y verificar que pasa**

Run: `cd frontend && npx vitest run src/application/use-cases/refunds/refund-sale.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/application/use-cases/refunds/refund-sale.ts frontend/src/application/use-cases/refunds/refund-sale.test.ts
git commit -m "fix: exige motivo de 5 a 200 caracteres en devoluciones"
```

---

### Task 2: Validar el motivo en el backend y en la sincronización

**Files:**
- Modify: `backend/src/main/java/com/caja/shifts/ShiftApplicationService.java:78-107`
- Modify: `backend/src/main/java/com/caja/synchronization/SyncService.java:106-140`
- Test: `backend/src/test/java/com/caja/sales/SaleApplicationIT.java`
- Test: `backend/src/test/java/com/caja/synchronization/SyncIT.java`

**Interfaces:**
- Consumes: `ShiftApplicationService.applyRefund(RefundCommand)` y `SyncService.validate(...)` existentes.
- Produces: ambos rechazan motivos recortados fuera de 5–200 con `IllegalArgumentException` / `IllegalStateException`; la sincronización responde `REJECTED`.

- [ ] **Step 1: Escribir la prueba de aplicación que falla**

Añadir a `SaleApplicationIT`:

```java
@Test void rejectsARefundWithAShortReason() {
  var ctx = fixture();
  var product = insertProduct(ctx, 16500);
  var sale = sales.apply(saleCommand(ctx, product, 16500, 16500, 1, null, "CASH"));

  assertThrows(IllegalArgumentException.class, () -> shifts.applyRefund(new RefundCommand(
      ctx.tenantId(), ctx.locationId(), ctx.deviceId(), ctx.userId(), ctx.shiftId(),
      sale.id(), "CASH", "abcd", Instant.now())));
  assertEquals(0, jdbc.queryForObject("select count(*) from refunds where tenant_id = ?",
      Integer.class, ctx.tenantId()));
  assertEquals("CHARGED", jdbc.queryForObject("select status from sales where id = ?",
      String.class, sale.id()));
}
```

Run: `cd backend && ./mvnw verify -Dit.test=SaleApplicationIT#rejectsARefundWithAShortReason -DfailIfNoTests=false`
Expected: FAIL porque hoy se acepta.

- [ ] **Step 2: Escribir la prueba de sincronización que falla**

Añadir a `SyncIT`:

```java
@Test void refundWithShortReasonIsRejectedThroughSync() throws Exception {
  var ctx = fixture();
  var sale = push(ctx, List.of(saleOperation(ctx, "op-refund-sale", 1, 16500, Instant.now())));
  assertEquals("APPLIED", syncStatus(sale.get(0)));
  var saleId = UUID.fromString((String) result(sale.get(0), "id"));

  var bad = push(ctx, List.of(refundOperation(ctx, "op-bad-refund", 2, saleId, "abcd",
      Instant.now())));
  assertEquals("REJECTED", syncStatus(bad.get(0)));
  assertEquals(0, jdbc.queryForObject("select count(*) from refunds where tenant_id = ?",
      Integer.class, ctx.tenantId()));

  var good = push(ctx, List.of(refundOperation(ctx, "op-good-refund", 3, saleId,
      "cobro equivocado", Instant.now())));
  assertEquals("APPLIED", syncStatus(good.get(0)));
  assertEquals(1, jdbc.queryForObject("select count(*) from refunds where tenant_id = ?",
      Integer.class, ctx.tenantId()));
}
```

Añadir el helper junto a `saleOperation`:

```java
private SyncOperation refundOperation(Ctx ctx, String operationId, long seq, UUID saleId,
                                      String reason, Instant clientCreatedAt) {
  var id = UUID.nameUUIDFromBytes(operationId.getBytes(StandardCharsets.UTF_8));
  return new SyncOperation(id, seq, "REFUND_SALE", saleId, ctx.userId(), clientCreatedAt,
      Map.of("shiftId", ctx.shiftId().toString(), "saleId", saleId.toString(),
          "method", "CASH", "reason", reason));
}
```

Run: `cd backend && ./mvnw verify -Dit.test=SyncIT#refundWithShortReasonIsRejectedThroughSync -DfailIfNoTests=false`
Expected: FAIL; el motivo corto se aplica.

- [ ] **Step 3: Implementar la validación compartida del motivo**

En `ShiftApplicationService.applyRefund`, antes de `requireOpenShift`:

```java
var reason = command.reason() == null ? "" : command.reason().trim();
if (reason.length() < 5 || reason.length() > 200) {
  throw new IllegalArgumentException("El motivo de la devolución debe tener entre 5 y 200 caracteres");
}
```

Usar `reason` en el `insert` y en `audit.record` en lugar de `command.reason()`.

En `SyncService.validate`, dentro de `if ("REFUND_SALE".equals(operation.type()))`, antes de contar devoluciones:

```java
var reason = payload.get("reason") instanceof String text ? text.trim() : "";
if (reason.length() < 5 || reason.length() > 200) {
  throw new IllegalStateException("El motivo de la devolución debe tener entre 5 y 200 caracteres");
}
```

- [ ] **Step 4: Ejecutar las dos pruebas y verificar que pasan**

Run: `cd backend && ./mvnw verify -Dit.test=SaleApplicationIT#rejectsARefundWithAShortReason,SyncIT#refundWithShortReasonIsRejectedThroughSync -DfailIfNoTests=false`
Expected: PASS, 0 fallos.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/caja/shifts/ShiftApplicationService.java backend/src/main/java/com/caja/synchronization/SyncService.java backend/src/test/java/com/caja/sales/SaleApplicationIT.java backend/src/test/java/com/caja/synchronization/SyncIT.java
git commit -m "fix: valida el motivo de devolución en backend y sync"
```

---

### Task 3: Detalle del pedido con reimpresión y devolución segura

**Files:**
- Modify: `frontend/src/modules/printing/receipt.ts:17-21,65-78,142-143,181`
- Create: `frontend/src/modules/refunds/OrderDetailPanel.tsx`
- Modify: `frontend/src/modules/refunds/RefundScreen.tsx`
- Test: `frontend/src/modules/refunds/RefundScreen.test.tsx`

**Interfaces:**
- Consumes: `loadReceiptData`, `refundSale`, `printReceipt`.
- Produces:
  - `receipt.ts` exporta `PAYMENT_LABELS: Record<PaymentRow['method'], string>` y `saleTypeLabel(sale: SaleRow): string`.
  - `OrderDetailPanel` con props `{ database?: CajaDb; saleId: string; onPrint?: (saleId: string) => Promise<void>; onClose: () => void; onChanged: () => void }`.
  - `RefundScreen` mantiene `selectedId: string | null` y pasa `saleId` al panel.

- [ ] **Step 1: Exportar las etiquetas de presentación**

En `receipt.ts`:

- Renombrar `PAYMENT_LABELS` a exportada: `export const PAYMENT_LABELS: Record<PaymentRow['method'], string> = ...`.
- Renombrar `typeLabel` a `export function saleTypeLabel(sale: SaleRow): string` y actualizar la llamada de la línea 181.

- [ ] **Step 2: Escribir las pruebas del detalle que fallan**

En `RefundScreen.test.tsx`, importar `type SaleRow`, `bogotaDate()` y añadir un seed reutilizable:

```tsx
async function seedDetail(db: CajaDb) {
  await db.users.put({ id: 'u1', username: 'ana', role: 'CASHIER' })
  await db.meta.put({ key: 'activeUserId', value: 'u1' })
  await db.shifts.put({
    id: 'shift-1', userId: 'u1', openingCashPesos: 50000, openedAt: new Date().toISOString(),
    closedAt: null, countedCashPesos: null, expectedPesos: null, differencePesos: null,
    operationalDate: bogotaDate()
  })
  await db.sales.put({
    id: 's1', displayCode: 'ALM-A-000001', status: 'CHARGED', totalPesos: 18000,
    type: 'DINE_IN', method: 'CARD', operationalDate: bogotaDate(),
    createdAt: '2026-11-10T15:00:00.000Z', shiftId: 'shift-1', userId: 'u1',
    tableLabel: 'Mesa 4', deliveryFeePesos: 0
  })
  await db.saleItems.put({
    id: 'i1', saleId: 's1', productId: 'p1', productName: 'SENCILLA',
    categoryName: 'HAMBURGUESAS', quantity: 2, unitPricePesos: 8000, costPesos: null,
    lineTotalPesos: 18000, note: 'Sin cebolla', lineNumber: 1,
    modifiers: [{ id: 'm1', name: 'Queso', additionalPricePesos: 1000 }], components: []
  })
  await db.payments.put({ id: 'pay1', saleId: 's1', method: 'CARD', amountPesos: 18000 })
}
```

Añadir un helper de render y las pruebas:

```tsx
function renderScreen(db: CajaDb, onPrint?: (id: string) => Promise<void>) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <RefundScreen database={db} onPrint={onPrint} />
    </MemoryRouter>
  )
}

it('muestra el detalle con ítems, mesa y pagos', async () => {
  const db = testDb()
  await seedDetail(db)
  renderScreen(db)

  await userEvent.click(await screen.findByRole('button', { name: /ver alm-a-000001/i }))

  expect(await screen.findByText(/SENCILLA/)).toBeInTheDocument()
  expect(screen.getByText('Mesa 4')).toBeInTheDocument()
  expect(screen.getByText(/Queso/)).toBeInTheDocument()
  expect(screen.getByText(/Sin cebolla/)).toBeInTheDocument()
  expect(screen.getByText('Tarjeta')).toBeInTheDocument()
})

it('solo ofrece devolver desde el detalle', async () => {
  const db = testDb()
  await seedDetail(db)
  renderScreen(db)

  await screen.findByText('ALM-A-000001')
  expect(screen.queryByRole('button', { name: /devolver/i })).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: /ver alm-a-000001/i }))
  expect(await screen.findByRole('button', { name: /devolver/i })).toBeInTheDocument()
})

it('devuelve desde el detalle y muestra el motivo', async () => {
  const db = testDb()
  await seedDetail(db)
  renderScreen(db)

  await userEvent.click(await screen.findByRole('button', { name: /ver alm-a-000001/i }))
  await userEvent.click(await screen.findByRole('button', { name: /devolver/i }))
  await userEvent.type(screen.getByLabelText(/motivo/i), 'cobro equivocado')
  await userEvent.click(screen.getByRole('button', { name: /confirmar devolución/i }))

  expect(await screen.findByText(/cobro equivocado/)).toBeInTheDocument()
  expect((await screen.findAllByText(/Devuelta/)).length).toBeGreaterThan(0)
  expect((await db.sales.get('s1'))?.status).toBe('REFUNDED')
})

it('rechaza un motivo corto sin cambiar el estado de la venta', async () => {
  const db = testDb()
  await seedDetail(db)
  renderScreen(db)

  await userEvent.click(await screen.findByRole('button', { name: /ver alm-a-000001/i }))
  await userEvent.click(await screen.findByRole('button', { name: /devolver/i }))
  await userEvent.type(screen.getByLabelText(/motivo/i), 'abcd')
  await userEvent.click(screen.getByRole('button', { name: /confirmar devolución/i }))

  expect(await screen.findByText(/entre 5 y 200/)).toBeInTheDocument()
  expect((await db.sales.get('s1'))?.status).toBe('CHARGED')
})

it('usa el medio de la venta cuando no hay filas de pagos', async () => {
  const db = testDb()
  await seedDetail(db)
  await db.payments.clear()
  renderScreen(db)

  await userEvent.click(await screen.findByRole('button', { name: /ver alm-a-000001/i }))
  expect(await screen.findByText('Tarjeta')).toBeInTheDocument()
})

it('no rompe con una venta devuelta sin fila de devolución', async () => {
  const db = testDb()
  await seedDetail(db)
  await db.sales.update('s1', { status: 'REFUNDED' })
  renderScreen(db)

  await userEvent.click(await screen.findByRole('button', { name: /ver alm-a-000001/i }))
  expect((await screen.findAllByText(/Devuelta/)).length).toBeGreaterThan(0)
  expect(screen.queryByRole('button', { name: /devolver/i })).not.toBeInTheDocument()
})
```

- [ ] **Step 3: Ejecutar y verificar que fallan**

Run: `cd frontend && npx vitest run src/modules/refunds/RefundScreen.test.tsx`
Expected: FAIL porque no existe el botón **Ver** ni el panel.

- [ ] **Step 4: Crear `OrderDetailPanel.tsx`**

Implementar el componente con la firma del bloque **Interfaces**. Al montar o cambiar `saleId`:

```ts
const data = await loadReceiptData(database, saleId)
const refund = (await database.refunds.where('saleId').equals(saleId).first()) ?? null
setDetail({ ...data, refund })
```

Requisitos de render:
- Cabecera con código, estado (`Cobrada`/`Devuelta`) y botón **Cerrar** que llama `onClose`.
- Fecha y hora con `Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' })`.
- `Venta: {saleTypeLabel(sale)}` y `Cajero: {cashierName}`.
- Ítems ordenados por `lineNumber`: `{quantity} x {productName}`, total de línea, modificadores (`+ nombre $precio`), nota y componentes si existen.
- Envío solo si `deliveryFeePesos > 0`; total siempre.
- Pagos: si `payments.length > 0`, una fila por pago con `PAYMENT_LABELS[method]`; si no, una fila con `PAYMENT_LABELS[sale.method]` (si existe).
- Si `refund`: bloque con monto, medio, motivo y fecha.
- Botones **Imprimir comprobante** (llama `onPrint` o `printReceipt`) y **Devolver** solo si `status === 'CHARGED'` y no hay `refund`.
- **Devolver** abre el formulario: `Motivo` (`Input`, label accesible), `Medio` (`select` Efectivo/Tarjeta/Bre-B), **Confirmar devolución** y **Cancelar**. `Confirmar` llama `refundSale({ saleId, reason, method }, database)`, recarga el detalle, limpia el formulario, muestra `Devolución de $... registrada` y llama `onChanged()`.
- Errores de carga, impresión y devolución visibles; la impresión fallida no cierra el panel.
- El contenedor del panel usa `lg:sticky lg:top-[calc(var(--header-height)+1rem)] lg:max-h-[calc(100vh-var(--header-height)-2rem)] lg:overflow-y-auto`.

- [ ] **Step 5: Conectar el panel en `RefundScreen`**

- Estado nuevo: `selectedId: string | null` (reemplaza `selected`, `reason`, `method`, `message` y `onRefund`).
- `refresh()` carga `database.sales.orderBy('createdAt').reverse().toArray()`; se mantiene por ahora sin filtros.
- Cada fila termina en un `Button variant="ghost"` con `aria-label={`Ver ${sale.displayCode}`}` y `onClick={() => setSelectedId(sale.id)}`; eliminar **Imprimir** y **Devolver** de la tabla.
- El panel derecho renderiza `OrderDetailPanel` cuando `selectedId`, con `onClose={() => setSelectedId(null)}`, `onChanged={refresh}` y `onPrint`; si no, el texto `Selecciona un pedido para ver el detalle.`
- Eliminar de `RefundScreen` el uso directo de `refundSale` y `printReceipt`.

- [ ] **Step 6: Ejecutar las pruebas y verificar que pasan**

Run: `cd frontend && npx vitest run src/modules/refunds/RefundScreen.test.tsx src/modules/printing/receipt.test.ts`
Expected: PASS. Actualizar la prueba de reimpresión existente para hacer clic en **Ver** antes de **Imprimir comprobante**.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/modules/printing/receipt.ts frontend/src/modules/refunds/OrderDetailPanel.tsx frontend/src/modules/refunds/RefundScreen.tsx frontend/src/modules/refunds/RefundScreen.test.tsx
git commit -m "feat: detalle de pedido con reimpresión y devolución segura"
```

---

### Task 4: Filtros, resumen y paginación del historial

**Files:**
- Create: `frontend/src/modules/refunds/order-list.ts`
- Create: `frontend/src/modules/refunds/order-list.test.ts`
- Modify: `frontend/src/modules/refunds/RefundScreen.tsx`
- Test: `frontend/src/modules/refunds/RefundScreen.test.tsx`

**Interfaces:**
- Consumes: `SaleRow`, `bogotaDate()`, `OrderDetailPanel` de Task 3.
- Produces:
  - `type OrderStatusFilter = 'ALL' | 'CHARGED' | 'REFUNDED'`
  - `filterOrders(sales: SaleRow[], filters: { date: string | null; status: OrderStatusFilter; query: string }): SaleRow[]`
  - `ordersTotal(sales: SaleRow[]): number`

- [ ] **Step 1: Escribir la prueba del helper que falla**

Crear `order-list.test.ts`:

```ts
import { expect, it } from 'vitest'
import type { SaleRow } from '../../infrastructure/database/schema'
import { filterOrders, ordersTotal } from './order-list'

function sale(overrides: Partial<SaleRow>): SaleRow {
  return {
    id: 's', displayCode: 'ALM-A-1', status: 'CHARGED', totalPesos: 1000,
    type: 'COUNTER', operationalDate: '2026-11-10',
    createdAt: '2026-11-10T15:00:00.000Z', shiftId: 'sh', userId: 'u',
    deliveryFeePesos: 0, ...overrides
  }
}

it('filtra por día, estado y código y ordena por fecha descendente', () => {
  const rows = [
    sale({ id: '1', displayCode: 'ALM-A-1', createdAt: '2026-11-10T15:00:00.000Z' }),
    sale({ id: '2', displayCode: 'ALM-A-2', status: 'REFUNDED', createdAt: '2026-11-10T16:00:00.000Z' }),
    sale({ id: '3', displayCode: 'ALM-B-3', operationalDate: '2026-11-09' })
  ]

  expect(filterOrders(rows, { date: '2026-11-10', status: 'ALL', query: '' }).map((s) => s.id))
    .toEqual(['2', '1'])
  expect(filterOrders(rows, { date: '2026-11-10', status: 'REFUNDED', query: '' }).map((s) => s.id))
    .toEqual(['2'])
  expect(filterOrders(rows, { date: null, status: 'ALL', query: 'b-3' }).map((s) => s.id))
    .toEqual(['3'])
})

it('suma el total de las ventas', () => {
  expect(ordersTotal([sale({ totalPesos: 16500 }), sale({ totalPesos: 2000 })])).toBe(18500)
})
```

Run: `cd frontend && npx vitest run src/modules/refunds/order-list.test.ts`
Expected: FAIL porque el módulo no existe.

- [ ] **Step 2: Implementar `order-list.ts`**

Filtro de día contra `operationalDate`, estado contra `status`, código contra `displayCode` en minúsculas y sin recortar el texto buscado; orden `createdAt` descendente; `ordersTotal` suma `totalPesos`.

- [ ] **Step 3: Ejecutar la prueba del helper y verificar que pasa**

Run: `cd frontend && npx vitest run src/modules/refunds/order-list.test.ts`
Expected: PASS.

- [ ] **Step 4: Escribir las pruebas de la pantalla que fallan**

En `RefundScreen.test.tsx` añadir un helper y las pruebas:

```tsx
function order(overrides: Partial<SaleRow> = {}): SaleRow {  return {
    id: 's', displayCode: 'ALM-A-000000', status: 'CHARGED', totalPesos: 16500,
    type: 'COUNTER', method: 'CASH', operationalDate: bogotaDate(),
    createdAt: '2026-11-10T12:00:00.000Z', shiftId: 'shift-1', userId: 'u1',
    deliveryFeePesos: 0, ...overrides
  }
}

async function seedOrders(db: CajaDb) {
  for (let i = 1; i <= 51; i++) {
    await db.sales.put(order({
      id: `s${i}`,
      displayCode: `ALM-A-${String(i).padStart(6, '0')}`,
      createdAt: `2026-11-10T12:00:00.${String(i).padStart(3, '0')}Z`
    }))
  }
  await db.sales.put(order({
    id: 'old', displayCode: 'ALM-A-VIEJA', operationalDate: '2026-11-01',
    createdAt: '2026-11-01T12:00:00.000Z'
  }))
}

it('muestra solo el día actual y pagina de 50 en 50', async () => {
  const db = testDb()
  await seedOrders(db)
  renderScreen(db)

  expect(await screen.findByText(/51 pedidos/)).toBeInTheDocument()
  expect(screen.queryByText('ALM-A-VIEJA')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /cargar más/i }))
  expect(screen.queryByRole('button', { name: /cargar más/i })).not.toBeInTheDocument()
})

it('busca en todo el historial y muestra el estado vacío', async () => {
  const db = testDb()
  await seedOrders(db)
  renderScreen(db)

  await screen.findByText(/51 pedidos/)
  await userEvent.click(screen.getByRole('button', { name: /ver todo/i }))
  await userEvent.type(screen.getByLabelText(/buscar/i), 'vieja')

  expect(await screen.findByText('ALM-A-VIEJA')).toBeInTheDocument()
  expect(screen.getByText(/^1 pedido ·/)).toBeInTheDocument()

  await userEvent.clear(screen.getByLabelText(/buscar/i))
  await userEvent.type(screen.getByLabelText(/buscar/i), 'no-existe')
  expect(await screen.findByText('No hay pedidos para este filtro.')).toBeInTheDocument()
})

it('filtra por estado', async () => {
  const db = testDb()
  await db.sales.put(order({ id: 'ok', displayCode: 'ALM-A-OK' }))
  await db.sales.put(order({ id: 'ref', displayCode: 'ALM-A-REF', status: 'REFUNDED' }))
  renderScreen(db)

  await screen.findByText('ALM-A-OK')
  await userEvent.selectOptions(screen.getByLabelText('Estado'), 'REFUNDED')

  expect(await screen.findByText('ALM-A-REF')).toBeInTheDocument()
  expect(screen.queryByText('ALM-A-OK')).not.toBeInTheDocument()
})
```

Actualizar también los seeds de las pruebas existentes (`muestra las ventas registradas` y la de reimpresión) a `operationalDate: bogotaDate()`, porque el filtro inicial pasa a ser el día actual.

Run: `cd frontend && npx vitest run src/modules/refunds/RefundScreen.test.tsx`
Expected: FAIL porque no existen filtros ni paginación.

- [ ] **Step 5: Implementar filtros, resumen y paginación en `RefundScreen`**

- `refresh()` usa `database.sales.toArray()` (sin límite).
- Estados: `date: string | null` inicial `bogotaDate()`, `status: OrderStatusFilter` inicial `'ALL'`, `query: string` inicial `''`, `limit` inicial `50`.
- `const matches = filterOrders(allSales, { date, status, query })`, `const visible = matches.slice(0, limit)`.
- `useEffect(() => setLimit(50), [date, status, query])`.
- Controles: `Input type="date"` con label `Día`, botón **Ver todo** (`setDate(null)`, deshabilitado si ya es null), `select` con label `Estado` y opciones Todas/Cobradas/Devueltas, `Input` con label `Buscar`.
- Resumen en un solo nodo de texto: `` `${matches.length} ${matches.length === 1 ? 'pedido' : 'pedidos'} · $${ordersTotal(matches).toLocaleString('es-CO')}` ``.
- Columnas: Código, Fecha y hora, Tipo/Mesa (`saleTypeLabel`), Total, Estado, acción **Ver**.
- Si `matches.length === 0`, una fila con `colSpan={6}` y `No hay pedidos para este filtro.`
- Botón **Cargar más** debajo de la tabla solo si `matches.length > visible.length`; al hacer clic suma 50 al `limit`.

- [ ] **Step 6: Ejecutar las pruebas de pantalla y helper**

Run: `cd frontend && npx vitest run src/modules/refunds/order-list.test.ts src/modules/refunds/RefundScreen.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/modules/refunds/order-list.ts frontend/src/modules/refunds/order-list.test.ts frontend/src/modules/refunds/RefundScreen.tsx frontend/src/modules/refunds/RefundScreen.test.tsx
git commit -m "feat: filtra y pagina el historial de pedidos"
```

---

### Task 5: Documentación y verificación completa

**Files:**
- Modify: `docs/manual-operacion.md:42-47`
- Modify: `docs/estado.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: operación documentada y estado actualizado.

- [ ] **Step 1: Actualizar el manual**

Reemplazar el procedimiento de devolución por:

```markdown
1. En **Pedidos**, filtra por día o busca el código y toca **Ver**.
2. En el detalle, verifica ítems, pagos y total; usa **Imprimir comprobante** si hace falta.
3. Toca **Devolver**, escribe un motivo de 5 a 200 caracteres, elige el medio y confirma.
4. La devolución es por el total de la venta y queda en el turno abierto actual.
```

- [ ] **Step 2: Actualizar `docs/estado.md`**

Añadir una sección `## Pedidos: detalle y devolución segura (2026-11-10)` con las cinco tareas marcadas, la verificación y estas notas: devolución e impresión solo desde el detalle; filtros por día/estado/código; paginación de 50; motivo validado en cliente y servidor; sin cambios de API ni dependencias.

- [ ] **Step 3: Ejecutar la verificación completa**

```bash
cd frontend && npm test
cd frontend && npm run build
cd backend && ./mvnw verify
```

Expected: frontend y backend sin fallos; build correcto.

- [ ] **Step 4: Commit**

```bash
git add docs/manual-operacion.md docs/estado.md
git commit -m "docs: detalle de pedidos y devolución segura"
```
