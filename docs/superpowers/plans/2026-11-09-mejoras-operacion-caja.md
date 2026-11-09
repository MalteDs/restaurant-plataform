# Mejoras de operación de caja — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar promociones por día, cambio de precio autorizado, pagos combinados y gastos por categoría a la caja v1 sin romper la operación offline ni la cola de sincronización.

**Architecture:** Cuatro cambios independientes sobre el mismo núcleo de venta. El backend conserva precios y nombres congelados; agrega columnas nuevas en lugar de reescribir históricos. El frontend replica los campos en IndexedDB. La sincronización acepta los payloads antiguos para no perder operaciones que ya estén en la cola.

**Tech Stack:** Spring Boot + JdbcTemplate + PostgreSQL/Liquibase, React + Vite + Dexie, JUnit 5 + Testcontainers, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-09-mejoras-operacion-design.md`

## Global Constraints

- Dinero en `bigint` y sufijo `_pesos`; nunca `float`, `double` ni `numeric`.
- Toda tabla operativa conserva `tenant_id` y `location_id`; las FKs nuevas son compuestas.
- La venta nace offline; nada de este plan puede exigir conexión para cobrar.
- Los payloads antiguos de la cola (`method`, sin `payments`, sin `catalogUnitPricePesos`) deben seguir sincronizando.
- Los precios, nombres y categorías de ventas pasadas no se reescriben.
- El servidor valida rol y pertenencia a tenant/sede; ocultar un botón no es control de seguridad.
- Montos negativos se rechazan. Una venta de total cero admite un pago de monto cero.
- Textos de interfaz en español; controles con etiqueta accesible.
- Cada tarea termina con pruebas verdes y un commit propio.

## Review Focus

Estas son las fallas que más probablemente afecten a una persona usando la caja; cada una debe quedar cubierta por la prueba indicada en su tarea.

1. **Pago combinado que no suma el total**: una venta debe rechazarse completa, no guardar pagos parciales ni una venta huérfana. Prueba en Tarea 5.
2. **Arqueo con pago mixto**: el efectivo esperado debe contar solo la porción en efectivo, no el total de la venta repetido por cada pago. Prueba en Tarea 5.
3. **Cola offline anterior al despliegue**: una operación con `method` y sin `payments` debe sincronizar como un pago por el total. Prueba en Tarea 5.
4. **Cajero que cambia precios**: la caja debe ocultarlo y el servidor debe rechazar la operación aunque el payload llegue manipulado. Pruebas en Tareas 3 y 4.
5. **Categoría de gasto inactiva o renombrada**: no debe aceptarse en gastos nuevos y el gasto histórico debe conservar el nombre con el que se registró. Pruebas en Tarea 7.

## File Structure

| Área | Archivos principales |
|---|---|
| Migraciones | `backend/src/main/resources/db/changelog/021-catalog-sale-days.yaml`, `022-price-override.yaml`, `023-split-payments.yaml`, `024-expense-categories.yaml`, `db.changelog-master.yaml` |
| Catálogo backend | `catalog/CatalogSnapshot.java`, `catalog/CatalogService.java`, `catalog/CatalogController.java` |
| Ventas backend | `sales/CreateSaleCommand.java`, `sales/SaleApplicationService.java`, `payments/PaymentService.java` |
| Turnos backend | `shifts/ShiftApplicationService.java` |
| Sync backend | `synchronization/SyncService.java` |
| Gastos/reportes backend | `expenses/ExpenseService.java`, `expenses/ExpenseController.java`, `reports/Summary.java`, `reports/ReportService.java` |
| Catálogo frontend | `infrastructure/database/schema.ts`, `application/use-cases/catalog/sync-catalog.ts`, `modules/sales/sale-days.ts`, `modules/sales/SaleScreen.tsx`, `modules/admin/CatalogScreen.tsx`, `shared/dates.ts` |
| Venta frontend | `application/use-cases/sales/create-sale.ts`, `modules/sales/SaleScreen.tsx` |
| Devolución frontend | `application/use-cases/refunds/refund-sale.ts`, `modules/refunds/RefundScreen.tsx` |
| Gastos frontend | `modules/expenses/ExpensesScreen.tsx`, `modules/admin/SettingsScreen.tsx`, `modules/reports/ReportsScreen.tsx`, `application/use-cases/reports/local-summary.ts` |

---

### Task 1: Días de venta en el catálogo (backend)

**Files:**
- Create: `backend/src/main/resources/db/changelog/021-catalog-sale-days.yaml`
- Modify: `backend/src/main/resources/db/changelog/db.changelog-master.yaml`
- Modify: `backend/src/main/java/com/caja/catalog/CatalogSnapshot.java`
- Modify: `backend/src/main/java/com/caja/catalog/CatalogService.java`
- Modify: `backend/src/main/java/com/caja/catalog/CatalogController.java`
- Test: `backend/src/test/java/com/caja/catalog/CatalogIT.java`

**Interfaces:**
- Produces: `CatalogSnapshot.ProductView(..., List<Integer> saleDays)`.
- Produces: `CatalogService.createProduct(TenantId, UUID, String, UUID, long, Long, String, List<Integer>)` and `updateProduct(TenantId, UUID, UUID, String, UUID, Long, Long, Boolean, List<Integer>)`.
- Produces: JSON `saleDays: [1,2,3,4]`; `null` o `[]` significa todos los días.
- Consumes: tablas `products` y `locations` existentes.

- [ ] **Step 1: Escribir la prueba que falla**

En `CatalogIT`, agregar:

```java
@Test void saleDaysRoundTripAndRejectInvalidDays() throws Exception {
  mvc.perform(post("/api/catalog/products").contentType(MediaType.APPLICATION_JSON)
          .header("Authorization", "Bearer " + adminToken("admin_dias"))
          .content(json.writeValueAsString(Map.of("name", "COMBO PROMO", "pricePesos", 22500,
              "saleDays", List.of(1, 2, 3, 4)))))
      .andExpect(status().isCreated());

  assertEquals(List.of(1, 2, 3, 4), product(snapshot(), "COMBO PROMO").get("saleDays"));

  mvc.perform(post("/api/catalog/products").contentType(MediaType.APPLICATION_JSON)
          .header("Authorization", "Bearer " + adminToken("admin_dias"))
          .content(json.writeValueAsString(Map.of("name", "COMBO MALO", "pricePesos", 1000,
              "saleDays", List.of(0, 8)))))
      .andExpect(status().isBadRequest());
}
```

- [ ] **Step 2: Correr la prueba y ver el fallo**

Run: `cd backend && ./mvnw test -Dtest=CatalogIT`
Expected: FAIL porque `saleDays` no existe o no se guarda.

- [ ] **Step 3: Implementar la migración y el contrato**

`021-catalog-sale-days.yaml`:

```yaml
databaseChangeLog:
  - changeSet:
      id: 021-catalog-sale-days
      author: caja
      changes:
        - addColumn:
            tableName: products
            columns:
              - column:
                  name: sale_days
                  type: varchar(20)
        - sql:
            sql: |
              alter table products
                add constraint products_sale_days_ck
                check (sale_days is null or sale_days ~ '^[1-7](,[1-7])*$');
```

Incluir el archivo en `db.changelog-master.yaml`. En `CatalogSnapshot.ProductView`, agregar `List<Integer> saleDays` al final. En `CatalogService`, seleccionar `p.sale_days`, convertir con un helper `parseSaleDays(String)` (vacío → `List.of()`) y formatear con `formatSaleDays(List<Integer>)` (vacío → `null`, valores únicos y ordenados separados por coma). En `createProduct` insertar `sale_days`; en `updateProduct` usar `sale_days = case when ? then ? else sale_days end` para distinguir “no enviado” (`null`) de “limpiar” (`[]`). En `CatalogController`, agregar `List<@NotNull @Min(1) @Max(7) Integer> saleDays` a `ProductRequest` y `ProductUpdate`.

- [ ] **Step 4: Correr la prueba y verla pasar**

Run: `cd backend && ./mvnw test -Dtest=CatalogIT`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/changelog/021-catalog-sale-days.yaml \
  backend/src/main/resources/db/changelog/db.changelog-master.yaml \
  backend/src/main/java/com/caja/catalog backend/src/test/java/com/caja/catalog/CatalogIT.java
git commit -m "feat: dias de venta en el catalogo"
```

---

### Task 2: Días de venta en la caja y el admin (frontend)

**Files:**
- Modify: `frontend/src/shared/dates.ts`
- Modify: `frontend/src/shared/dates.test.ts`
- Create: `frontend/src/modules/sales/sale-days.ts`
- Create: `frontend/src/modules/sales/sale-days.test.ts`
- Modify: `frontend/src/infrastructure/database/schema.ts`
- Modify: `frontend/src/application/use-cases/catalog/sync-catalog.ts`
- Modify: `frontend/src/modules/sales/SaleScreen.tsx`
- Modify: `frontend/src/modules/admin/CatalogScreen.tsx`
- Test: `frontend/src/modules/sales/SaleScreen.test.tsx`

**Interfaces:**
- Produces: `bogotaWeekday(now?: Date): number` con 1 = lunes … 7 = domingo.
- Produces: `isProductSellable(product: Pick<ProductRow, 'saleDays'>, now?: Date): boolean`.
- Produces: `parseSaleDaysInput(value: string): number[]` y `formatSaleDays(days?: number[]): string`.
- Produces: `ProductRow.saleDays?: number[]`; el tipo del snapshot agrega `saleDays?: number[]`.
- Consumes: `ProductView.saleDays` de la Tarea 1.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `sale-days.test.ts`:

```ts
it('un producto con días solo se vende esos días', () => {
  expect(isProductSellable({ saleDays: [1, 2, 3, 4] }, new Date('2026-11-09T15:00:00Z'))).toBe(true)
  expect(isProductSellable({ saleDays: [1, 2, 3, 4] }, new Date('2026-11-13T15:00:00Z'))).toBe(false)
  expect(isProductSellable({}, new Date('2026-11-13T15:00:00Z'))).toBe(true)
})

it('normaliza el texto de días del admin', () => {
  expect(parseSaleDaysInput('')).toEqual([])
  expect(parseSaleDaysInput('4, 2, 2, 1')).toEqual([1, 2, 4])
  expect(parseSaleDaysInput('0, 8, x')).toEqual([])
})
```

En `SaleScreen.test.tsx`, agregar una prueba que use el día actual de Bogotá y un día distinto:

```ts
it('oculta productos que no se venden hoy', async () => {
  const db = openDb(`test-screen-${crypto.randomUUID()}`)
  opened.push(db)
  const today = bogotaWeekday(new Date())
  const other = today === 7 ? 1 : today + 1
  await db.products.bulkPut([
    { id: 'hoy', name: 'PROMO HOY', categoryName: 'COMBOS', kind: 'COMBO', pricePesos: 22500,
      costPesos: null, sortOrder: 1, active: true, modifierGroupIds: [], components: [],
      saleDays: [today] },
    { id: 'otro', name: 'PROMO OTRO DIA', categoryName: 'COMBOS', kind: 'COMBO', pricePesos: 22500,
      costPesos: null, sortOrder: 1, active: true, modifierGroupIds: [], components: [],
      saleDays: [other] }
  ])

  render(<SaleScreen database={db} />)

  expect(await screen.findByRole('button', { name: /promo hoy/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /promo otro dia/i })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Correr las pruebas y ver el fallo**

Run: `cd frontend && npm test -- src/modules/sales/sale-days.test.ts src/modules/sales/SaleScreen.test.tsx`
Expected: FAIL porque los helpers y el filtro no existen.

- [ ] **Step 3: Implementar**

`bogotaWeekday` usa `Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', weekday: 'short' })` y mapea `Mon`…`Sun` a 1…7. `isProductSellable` devuelve `true` si `saleDays` está vacío o incluye el día actual. `parseSaleDaysInput` separa por coma, convierte a entero, conserva 1–7, deduplica y ordena; `formatSaleDays` une con coma.

En `SaleScreen`, mantener un estado `now` actualizado cada minuto y filtrar dentro del `useMemo` que arma las familias (incluir `now` en las dependencias):

```ts
rows.filter((row) => row.active && isProductSellable(row, now))
```

En `schema.ts` y `sync-catalog.ts`, agregar `saleDays?: number[]` a `ProductRow` y al payload. En `CatalogScreen`, agregar una columna “Días” con un `Input` que muestre `formatSaleDays(product.saleDays)` y guarde `saleDays: parseSaleDaysInput(valor)`. El texto de ayuda: “1=lunes … 7=domingo; vacío=todos”.

- [ ] **Step 4: Correr pruebas y build**

Run: `cd frontend && npm test -- src/modules/sales/sale-days.test.ts src/modules/sales/SaleScreen.test.tsx && npm run build`
Expected: PASS y build sin errores de tipos.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/dates.ts frontend/src/shared/dates.test.ts \
  frontend/src/modules/sales/sale-days.ts frontend/src/modules/sales/sale-days.test.ts \
  frontend/src/modules/sales/SaleScreen.tsx frontend/src/modules/sales/SaleScreen.test.tsx \
  frontend/src/modules/admin/CatalogScreen.tsx \
  frontend/src/infrastructure/database/schema.ts \
  frontend/src/application/use-cases/catalog/sync-catalog.ts
git commit -m "feat: filtrar promociones por dia en la caja"
```

---

### Task 3: Cambio de precio autorizado (backend)

**Files:**
- Create: `backend/src/main/resources/db/changelog/022-price-override.yaml`
- Modify: `backend/src/main/resources/db/changelog/db.changelog-master.yaml`
- Modify: `backend/src/main/java/com/caja/sales/CreateSaleCommand.java`
- Modify: `backend/src/main/java/com/caja/sales/SaleApplicationService.java`
- Modify: `backend/src/main/java/com/caja/synchronization/SyncService.java`
- Test: `backend/src/test/java/com/caja/sales/SaleApplicationIT.java`
- Test: `backend/src/test/java/com/caja/synchronization/SyncIT.java`

**Interfaces:**
- Produces: `CreateSaleCommand.ItemCommand(productId, productName, categoryName, quantity, unitPricePesos, costPesos, note, modifiers, components, catalogUnitPricePesos, overrideReason)`.
- Produces: columnas `sale_items.catalog_unit_price_pesos`, `sale_items.override_reason`, `sale_items.override_user_id`.
- Produces: evento de auditoría `PRICE_OVERRIDDEN`.
- Consumes: `users.role` y `audit_events`.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `SaleApplicationIT`:

```java
@Test void cashierCannotOverridePrice() {
  var ctx = fixture(); // usuario CASHIER
  var product = insertProduct(ctx, 16500);

  assertThrows(IllegalStateException.class, () -> sales.apply(
      saleCommand(ctx, product, 14000, 16500, 1, "descuento autorizado")));
  assertEquals(0, jdbc.queryForObject("select count(*) from sales where tenant_id = ?",
      Integer.class, ctx.tenantId()));
}

@Test void managerOverrideStoresBothPricesAndAudit() {
  var ctx = fixture();
  jdbc.update("update users set role = 'MANAGER' where id = ?", ctx.userId());
  var product = insertProduct(ctx, 16500);

  var applied = sales.apply(saleCommand(ctx, product, 14000, 16500, 1, "descuento autorizado"));

  assertEquals(14000, applied.totalPesos());
  var row = jdbc.queryForMap("select unit_price_pesos, catalog_unit_price_pesos, override_reason, "
      + "override_user_id from sale_items where sale_id = ?", applied.id());
  assertEquals(14000L, ((Number) row.get("unit_price_pesos")).longValue());
  assertEquals(16500L, ((Number) row.get("catalog_unit_price_pesos")).longValue());
  assertEquals("descuento autorizado", row.get("override_reason"));
  assertEquals(1, jdbc.queryForObject("select count(*) from audit_events where event_type = "
      + "'PRICE_OVERRIDDEN'", Integer.class));
}
```

En `SyncIT`, agregar una operación con `catalogUnitPricePesos` distinto y usuario MANAGER; verificar `APPLIED`. Mantener la operación legacy existente sin esos campos y verificar que sigue en `APPLIED`.

Actualizar el helper `saleCommand` de `SaleApplicationIT` a `saleCommand(ctx, productId, unitPrice, catalogPrice, quantity, overrideReason, String method, ModifierCommand... modifiers)`; las pruebas existentes pasan `catalogPrice = unitPrice` y `overrideReason = null`. Actualizar también los métodos `withType`, `withTableLabel`, `withDeliveryFee` y `withItems` de `CreateSaleCommand` para copiar los campos nuevos.

- [ ] **Step 2: Correr las pruebas y ver el fallo**

Run: `cd backend && ./mvnw test -Dtest=SaleApplicationIT,SyncIT`
Expected: FAIL por columnas/campos inexistentes.

- [ ] **Step 3: Implementar**

`022-price-override.yaml`:

```yaml
databaseChangeLog:
  - changeSet:
      id: 022-price-override
      author: caja
      changes:
        - sql:
            sql: |
              alter table sale_items
                add column catalog_unit_price_pesos bigint,
                add column override_reason varchar(200),
                add column override_user_id uuid;
              alter table sale_items
                add constraint sale_items_catalog_price_ck
                  check (catalog_unit_price_pesos is null or catalog_unit_price_pesos >= 0);
              alter table sale_items
                add constraint sale_items_override_user_fk
                  foreign key (override_user_id, tenant_id, location_id)
                  references users(id, tenant_id, location_id);
              alter table sale_items
                add constraint sale_items_override_ck check (
                  (override_reason is null and override_user_id is null)
                  or (override_reason is not null and override_user_id is not null
                      and length(trim(override_reason)) >= 5)
                );
```

En `SaleApplicationService.apply`, antes de insertar:

1. Calcular el total con `CreateSaleCommand.totalPesos()`.
2. Detectar líneas con `unitPricePesos != catalogUnitPricePesos`.
3. Si hay alguna, consultar el rol de `command.userId()` en `users` filtrando tenant y sede. Si no es `MANAGER` ni `ADMIN`, lanzar `IllegalStateException("Solo encargado o admin puede cambiar precios")`.
4. Exigir `overrideReason` con al menos 5 caracteres en cada línea ajustada.
5. Insertar `catalog_unit_price_pesos`, `override_reason` y `override_user_id = command.userId()` (null si no hay ajuste).
6. Registrar `audit.record(..., "PRICE_OVERRIDDEN", "sale_item", itemId, Map.of("catalogPricePesos", ..., "appliedPricePesos", ..., "reason", ...))`.

En `SyncService.toSaleCommand`, leer `catalogUnitPricePesos` con valor por defecto `unitPricePesos` y `overrideReason` opcional. Así una operación antigua nunca se interpreta como ajuste. Inyectar `AuditService` en `SaleApplicationService`.

- [ ] **Step 4: Correr las pruebas y verlas pasar**

Run: `cd backend && ./mvnw test -Dtest=SaleApplicationIT,SyncIT`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/changelog/022-price-override.yaml \
  backend/src/main/resources/db/changelog/db.changelog-master.yaml \
  backend/src/main/java/com/caja/sales backend/src/main/java/com/caja/synchronization/SyncService.java \
  backend/src/test/java/com/caja/sales/SaleApplicationIT.java \
  backend/src/test/java/com/caja/synchronization/SyncIT.java
git commit -m "feat: cambio de precio autorizado con auditoria"
```

---

### Task 4: Cambio de precio en la caja (frontend)

**Files:**
- Modify: `frontend/src/infrastructure/database/schema.ts`
- Modify: `frontend/src/application/use-cases/sales/create-sale.ts`
- Test: `frontend/src/application/use-cases/sales/create-sale.test.ts`
- Modify: `frontend/src/modules/sales/SaleScreen.tsx`
- Test: `frontend/src/modules/sales/SaleScreen.test.tsx`

**Interfaces:**
- Produces: `SaleItemInput.catalogUnitPricePesos: number` y `overrideReason?: string | null`.
- Produces: `SaleItemRow.catalogUnitPricePesos?: number`, `overrideReason?: string | null`, `overrideUserId?: string | null`.
- Produces: el payload de `CREATE_SALE` incluye `catalogUnitPricePesos` y `overrideReason`.
- Consumes: rol del usuario en `database.users` y campos de la Tarea 3.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `create-sale.test.ts`:

```ts
it('un cajero no puede cambiar el precio', async () => {
  const db = await seed() // usuario CASHIER u1
  await expect(createSale(db, {
    ...baseInput(),
    items: [{ ...baseInput().items[0], unitPricePesos: 14000, catalogUnitPricePesos: 16500,
      overrideReason: 'descuento autorizado' }]
  })).rejects.toThrow(/encargado|admin/i)
  expect(await db.sales.count()).toBe(0)
})

it('un encargado guarda precio de lista, aplicado y motivo', async () => {
  const db = await seed()
  await db.users.put({ id: 'u1', username: 'ana', role: 'MANAGER' })
  const out = await createSale(db, {
    ...baseInput(),
    items: [{ ...baseInput().items[0], unitPricePesos: 14000, catalogUnitPricePesos: 16500,
      overrideReason: 'descuento autorizado' }]
  })
  const item = await db.saleItems.where('saleId').equals(out.saleId).first()
  expect(item).toMatchObject({ unitPricePesos: 14000, catalogUnitPricePesos: 16500,
    overrideReason: 'descuento autorizado', overrideUserId: 'u1' })
})
```

En `SaleScreen.test.tsx`, envolver los renders en `AuthProvider` y agregar:

```ts
it('el encargado ve el cambio de precio y el cajero no', async () => {
  localStorage.setItem('caja.user', JSON.stringify({ id: 'u1', username: 'ana',
    role: 'MANAGER', tenantId: 't', locationId: 'l' }))
  // render con un producto, agregarlo y esperar el botón "Cambiar precio"
})
```

- [ ] **Step 2: Correr las pruebas y ver el fallo**

Run: `cd frontend && npm test -- src/application/use-cases/sales/create-sale.test.ts src/modules/sales/SaleScreen.test.tsx`
Expected: FAIL por campos y botón inexistentes.

- [ ] **Step 3: Implementar**

En `create-sale.ts`, antes de la transacción, leer `const user = await database.users.get(userId)`; para cada línea donde `unitPricePesos !== catalogUnitPricePesos`, exigir rol `MANAGER`/`ADMIN` y `overrideReason.trim().length >= 5`. Guardar en `saleItems` los tres campos y enviarlos en el payload.

En `SaleScreen.tsx`, `CartLine` agrega `unitPricePesos`, `catalogUnitPricePesos` y `overrideReason`. Usar `useAuth()` para `canOverride`. Cada línea muestra un botón “Cambiar precio” solo si `canOverride`; abre un modal con precio nuevo (entero ≥ 0) y motivo. Al guardar, actualizar la línea y recalcular el total con `unitPricePesos`. En `onCharge`, enviar `unitPricePesos`, `catalogUnitPricePesos: line.product.pricePesos` y `overrideReason`. Mostrar “Precio de lista $X” cuando haya ajuste.

- [ ] **Step 4: Correr pruebas y build**

Run: `cd frontend && npm test -- src/application/use-cases/sales/create-sale.test.ts src/modules/sales/SaleScreen.test.tsx && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/infrastructure/database/schema.ts \
  frontend/src/application/use-cases/sales/create-sale.ts \
  frontend/src/application/use-cases/sales/create-sale.test.ts \
  frontend/src/modules/sales/SaleScreen.tsx frontend/src/modules/sales/SaleScreen.test.tsx
git commit -m "feat: cambio de precio por linea en la caja"
```

---

### Task 5: Pagos combinados (backend)

**Files:**
- Create: `backend/src/main/resources/db/changelog/023-split-payments.yaml`
- Modify: `backend/src/main/resources/db/changelog/db.changelog-master.yaml`
- Modify: `backend/src/main/java/com/caja/sales/CreateSaleCommand.java`
- Modify: `backend/src/main/java/com/caja/sales/SaleApplicationService.java`
- Modify: `backend/src/main/java/com/caja/shifts/ShiftApplicationService.java`
- Modify: `backend/src/main/java/com/caja/synchronization/SyncService.java`
- Test: `backend/src/test/java/com/caja/sales/SaleApplicationIT.java`
- Test: `backend/src/test/java/com/caja/synchronization/SyncIT.java`

**Interfaces:**
- Produces: `CreateSaleCommand.PaymentCommand(PaymentMethod method, long amountPesos)`.
- Produces: `CreateSaleCommand.payments(): List<PaymentCommand>` reemplaza `method`.
- Produces: `CreateSaleCommand.lineTotal(ItemCommand)` y `CreateSaleCommand.totalOf(List<ItemCommand>, long)` estáticos; `totalPesos()` de instancia delega en ellos.
- Consumes: tabla `payments` y `PaymentService.charge(...)`.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `SaleApplicationIT`:

```java
@Test void splitPaymentsAreStoredAndCashExpectedUsesOnlyCash() {
  var ctx = fixture();
  var product = insertProduct(ctx, 20000);

  var applied = sales.apply(saleCommand(ctx, product, 20000, 20000, 1, null,
      new CreateSaleCommand.PaymentCommand(PaymentMethod.CASH, 12000),
      new CreateSaleCommand.PaymentCommand(PaymentMethod.CARD, 8000)));

  assertEquals(2, jdbc.queryForObject("select count(*) from payments where sale_id = ?",
      Integer.class, applied.id()));
  assertEquals(62000, shifts.expectedCash(ctx.tenantId(), ctx.locationId(), ctx.shiftId()));
}

@Test void paymentSumMustMatchTheTotal() {
  var ctx = fixture();
  var product = insertProduct(ctx, 20000);

  assertThrows(IllegalArgumentException.class, () -> sales.apply(saleCommand(ctx, product,
      20000, 20000, 1, null,
      new CreateSaleCommand.PaymentCommand(PaymentMethod.CASH, 19000))));
  assertEquals(0, jdbc.queryForObject("select count(*) from sales where tenant_id = ?",
      Integer.class, ctx.tenantId()));
  assertEquals(0, jdbc.queryForObject("select count(*) from payments where tenant_id = ?",
      Integer.class, ctx.tenantId()));
}
```

Actualizar el helper `saleCommand` a `saleCommand(ctx, productId, unitPrice, catalogPrice, quantity, overrideReason, PaymentCommand... payments)`; las pruebas existentes pasan un solo pago por el total.

En `SyncIT`, conservar la operación legacy con `"method": "CASH"` y agregar una con `"payments"`:

```java
"payments", List.of(
    Map.of("method", "CASH", "amountPesos", 12000),
    Map.of("method", "CARD", "amountPesos", 8000))
```

- [ ] **Step 2: Correr las pruebas y ver el fallo**

Run: `cd backend && ./mvnw test -Dtest=SaleApplicationIT,SyncIT`
Expected: FAIL porque `payments` y los pagos múltiples no existen.

- [ ] **Step 3: Implementar**

`023-split-payments.yaml`:

```yaml
databaseChangeLog:
  - changeSet:
      id: 023-split-payments
      author: caja
      changes:
        - dropUniqueConstraint:
            tableName: payments
            constraintName: payments_sale_uk
        - createIndex:
            tableName: payments
            indexName: payments_sale_idx
            columnNames: sale_id
```

En `CreateSaleCommand`, reemplazar `PaymentMethod method` por `List<PaymentCommand> payments` y actualizar los métodos `with*` para copiar la lista. En `SaleApplicationService.apply`, validar antes de insertar:

- `payments` no vacío;
- cada monto `>= 0`; si el total es mayor que 0, cada monto debe ser `> 0`;
- suma exacta igual al total.

Si falla, lanzar `IllegalArgumentException` y no insertar nada. Insertar un `payments` por cada `PaymentCommand` con `payments.charge(...)`. En `ShiftApplicationService.expectedCash`, cambiar la consulta de ventas en efectivo para sumar `p.amount_pesos` (no `s.total_pesos`) con join por `sale_id`, tenant y sede.

En `SyncService.toSaleCommand`, si viene `payments`, construir la lista; si no, usar el `method` legado con monto `CreateSaleCommand.totalOf(items, deliveryFee)`. Para eso, agregar los estáticos `lineTotal`/`totalOf` y hacer que `totalPesos()` delegue en ellos; reutilizarlos también en `SaleApplicationService`.

- [ ] **Step 4: Correr las pruebas y verlas pasar**

Run: `cd backend && ./mvnw test -Dtest=SaleApplicationIT,SyncIT`
Expected: PASS, incluida la operación legacy.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/changelog/023-split-payments.yaml \
  backend/src/main/resources/db/changelog/db.changelog-master.yaml \
  backend/src/main/java/com/caja/sales backend/src/main/java/com/caja/shifts/ShiftApplicationService.java \
  backend/src/main/java/com/caja/synchronization/SyncService.java \
  backend/src/test/java/com/caja/sales/SaleApplicationIT.java \
  backend/src/test/java/com/caja/synchronization/SyncIT.java
git commit -m "feat: pagos combinados en la venta"
```

---

### Task 6: Pagos combinados y medio de devolución (frontend)

**Files:**
- Modify: `frontend/src/infrastructure/database/schema.ts`
- Modify: `frontend/src/application/use-cases/sales/create-sale.ts`
- Test: `frontend/src/application/use-cases/sales/create-sale.test.ts`
- Modify: `frontend/src/modules/sales/SaleScreen.tsx`
- Test: `frontend/src/modules/sales/SaleScreen.test.tsx`
- Modify: `frontend/src/application/use-cases/refunds/refund-sale.ts`
- Test: `frontend/src/application/use-cases/refunds/refund-sale.test.ts`
- Modify: `frontend/src/modules/refunds/RefundScreen.tsx`
- Test: `frontend/src/application/use-cases/shifts/close-shift.test.ts`

**Interfaces:**
- Produces: `SalePaymentInput { method: 'CASH' | 'CARD' | 'BREB'; amountPesos: number }`.
- Produces: `SaleInput.payments: SalePaymentInput[]`; se elimina `SaleInput.method`.
- Produces: `RefundInput.method: 'CASH' | 'CARD' | 'BREB'`.
- Consumes: backend de la Tarea 5.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `create-sale.test.ts`:

```ts
it('guarda dos pagos y exige que sumen el total', async () => {
  const db = await seed()
  const out = await createSale(db, {
    ...baseInput(),
    payments: [
      { method: 'CASH', amountPesos: 12000 },
      { method: 'CARD', amountPesos: 8000 }
    ]
  })
  expect(await db.payments.where('saleId').equals(out.saleId).count()).toBe(2)
})

it('rechaza pagos que no suman el total', async () => {
  const db = await seed()
  await expect(createSale(db, {
    ...baseInput(),
    payments: [{ method: 'CASH', amountPesos: 19000 }]
  })).rejects.toThrow(/suman|total/i)
  expect(await db.sales.count()).toBe(0)
})
```

En `refund-sale.test.ts`, devolver con `method: 'CARD'` y verificar que la devolución guarda `CARD`.

En `close-shift.test.ts`, agregar un pago `CARD` a la venta existente y verificar que el efectivo esperado no cambia (solo suma pagos `CASH`).

- [ ] **Step 2: Correr las pruebas y ver el fallo**

Run: `cd frontend && npm test -- src/application/use-cases/sales/create-sale.test.ts src/application/use-cases/refunds/refund-sale.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `create-sale.ts`, reemplazar `method` por `payments`. Validar suma exacta y montos (con la misma regla del backend: total 0 admite monto 0). Escribir un `PaymentRow` por cada pago y enviar `payments` en el payload. En `SaleRow`, dejar `method?: ...` solo por compatibilidad de datos viejos; las ventas nuevas no lo escriben.

En `SaleScreen.tsx`, mantener el flujo de un pago: si el usuario no divide, se envía un pago por el total con el medio seleccionado. Un botón “Dividir pago” activa una lista editable: cada fila tiene medio y monto, se puede agregar y quitar, y se muestra “Restante”. “Cobrar” se deshabilita si la suma no coincide con el total. Al confirmar, enviar `payments`.

En `refund-sale.ts`, usar `input.method` en la devolución y en el payload. En `RefundScreen.tsx`, agregar un selector de medio de devolución (Efectivo, Tarjeta, Bre-B) y pasarlo a `refundSale`.

- [ ] **Step 4: Correr pruebas y build**

Run: `cd frontend && npm test -- src/application/use-cases/sales/create-sale.test.ts src/application/use-cases/refunds/refund-sale.test.ts src/application/use-cases/shifts/close-shift.test.ts src/modules/sales/SaleScreen.test.tsx && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/infrastructure/database/schema.ts \
  frontend/src/application/use-cases/sales/create-sale.ts \
  frontend/src/application/use-cases/sales/create-sale.test.ts \
  frontend/src/modules/sales/SaleScreen.tsx frontend/src/modules/sales/SaleScreen.test.tsx \
  frontend/src/application/use-cases/refunds/refund-sale.ts \
  frontend/src/application/use-cases/refunds/refund-sale.test.ts \
  frontend/src/application/use-cases/shifts/close-shift.test.ts \
  frontend/src/modules/refunds/RefundScreen.tsx
git commit -m "feat: pagos combinados y medio de devolucion en la caja"
```

---

### Task 7: Categorías de gasto (backend)

**Files:**
- Create: `backend/src/main/resources/db/changelog/024-expense-categories.yaml`
- Modify: `backend/src/main/resources/db/changelog/db.changelog-master.yaml`
- Modify: `backend/src/main/java/com/caja/expenses/ExpenseService.java`
- Modify: `backend/src/main/java/com/caja/expenses/ExpenseController.java`
- Modify: `backend/src/main/java/com/caja/reports/Summary.java`
- Modify: `backend/src/main/java/com/caja/reports/ReportService.java`
- Test: `backend/src/test/java/com/caja/reports/ReportsIT.java`
- Test: `backend/src/test/java/com/caja/shared/SchemaIntegrityIT.java`

**Interfaces:**
- Produces: tabla `expense_categories(id, tenant_id, location_id, name, sort_order, active, created_at, updated_at)`.
- Produces: `ExpenseService.create(..., UUID categoryId, ...)` y `ExpenseService.categories(...)`.
- Produces: `GET/POST/PUT /api/expenses/categories`.
- Produces: `Summary.byExpenseCategory: List<ExpenseCategoryRow>` con `(String name, long amountPesos)`.
- Consumes: `expenses` existente; conserva la columna `category` como texto congelado.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `ReportsIT`, agregar:

```java
@Test void expenseRequiresAnActiveCategory() throws Exception {
  var ctx = fixture();
  var categoryId = createCategory(ctx, "Domicilios", "admin_categorias");

  mvc.perform(post("/api/expenses").contentType(MediaType.APPLICATION_JSON)
          .header("Authorization", "Bearer " + token(ctx, "gerente_categorias", "MANAGER"))
          .content(json.writeValueAsString(Map.of("expenseCategoryId", categoryId,
              "description", "Domicilio", "amountPesos", 10000))))
      .andExpect(status().isCreated());

  mvc.perform(put("/api/expenses/categories/" + categoryId)
          .contentType(MediaType.APPLICATION_JSON)
          .header("Authorization", "Bearer " + token(ctx, "admin_categorias", "ADMIN"))
          .content(json.writeValueAsString(Map.of("active", false))))
      .andExpect(status().isNoContent());

  mvc.perform(post("/api/expenses").contentType(MediaType.APPLICATION_JSON)
          .header("Authorization", "Bearer " + token(ctx, "gerente_categorias", "MANAGER"))
          .content(json.writeValueAsString(Map.of("expenseCategoryId", categoryId,
              "description", "Otro", "amountPesos", 5000))))
      .andExpect(status().isBadRequest());
}

@Test void summaryGroupsExpensesByFrozenCategoryName() throws Exception {
  var ctx = fixture();
  var categoryId = createCategory(ctx, "Fruver", "admin_categorias");
  // gasto nuevo con categoría + gasto legacy con texto "Transporte"
  // renombrar la categoría a "Mercado" y verificar que el resumen sigue mostrando "Fruver"
  // esperar byExpenseCategory con "Fruver" y "Transporte"
}
```

En `SchemaIntegrityIT`, agregar `"expense_categories"` al conjunto esperado. En `ReportsIT`, agregar el import de `put` de Spring MockMvc.

Agregar el helper `createCategory(Ctx ctx, String name, String adminUsername)`: hace `POST /api/expenses/categories` con token ADMIN y devuelve el `UUID` del `id`. Agregar también una prueba corta de compatibilidad: un `POST /api/expenses` con `category: "Transporte"` y sin `expenseCategoryId` sigue respondiendo `201` (cliente viejo durante el despliegue).

- [ ] **Step 2: Correr las pruebas y ver el fallo**

Run: `cd backend && ./mvnw test -Dtest=ReportsIT,SchemaIntegrityIT`
Expected: FAIL por tabla/endpoint/campo inexistente.

- [ ] **Step 3: Implementar**

`024-expense-categories.yaml` crea la tabla y las columnas:

```sql
create table expense_categories (
  id uuid primary key,
  tenant_id uuid not null references tenants(id) on delete restrict,
  location_id uuid not null,
  name varchar(100) not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint expense_categories_location_name_uk unique (location_id, name),
  constraint expense_categories_id_tenant_location_uk unique (id, tenant_id, location_id),
  constraint expense_categories_location_fk foreign key (location_id, tenant_id)
    references locations(id, tenant_id) on delete restrict
);
alter table expenses add column expense_category_id uuid;
alter table expenses add constraint expenses_category_fk
  foreign key (expense_category_id, tenant_id, location_id)
  references expense_categories(id, tenant_id, location_id) on delete restrict;
```

Después siembra las categorías por defecto para cada sede existente:

```sql
insert into expense_categories(id, tenant_id, location_id, name, sort_order)
select gen_random_uuid(), l.tenant_id, l.id, c.name, c.sort_order
from locations l
cross join (values ('Domicilios', 1), ('Fruver', 2), ('Insumos', 3),
                   ('Aseo', 4), ('Servicios', 5), ('Otros', 6)) as c(name, sort_order)
on conflict (location_id, name) do nothing;
```

`ExpenseService.create` recibe `UUID categoryId` y `String legacyCategory`. Si llega `categoryId`, busca la categoría activa del tenant/sede y copia su nombre a `expenses.category`; si no existe o está inactiva, lanza `ResponseStatusException(BAD_REQUEST, "Categoria de gasto invalida")`. Si no llega `categoryId` pero sí `legacyCategory` no vacío, acepta el texto legado y deja `expense_category_id` nulo (compatibilidad de despliegue; la UI nueva siempre envía id). Si no llega ninguno, responde 400. `categories` devuelve todas con `active`; `createCategory` y `updateCategory` validan nombre no vacío y duplicados.

En `ExpenseController`, agregar los tres endpoints. `ExpenseRequest` agrega `UUID expenseCategoryId` y conserva `category` como campo legado opcional; al menos uno de los dos debe venir.

En `Summary`, agregar `byExpenseCategory`; en `ReportService`, agrupar por `expenses.category` (texto congelado) y sumar `amount_pesos`.

- [ ] **Step 4: Correr las pruebas y verlas pasar**

Run: `cd backend && ./mvnw test -Dtest=ReportsIT,SchemaIntegrityIT`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/changelog/024-expense-categories.yaml \
  backend/src/main/resources/db/changelog/db.changelog-master.yaml \
  backend/src/main/java/com/caja/expenses backend/src/main/java/com/caja/reports \
  backend/src/test/java/com/caja/reports/ReportsIT.java \
  backend/src/test/java/com/caja/shared/SchemaIntegrityIT.java
git commit -m "feat: categorias administrables de gasto y reporte"
```

---

### Task 8: Categorías de gasto en la interfaz

**Files:**
- Modify: `frontend/src/modules/expenses/ExpensesScreen.tsx`
- Test: `frontend/src/modules/expenses/ExpensesScreen.test.tsx`
- Modify: `frontend/src/modules/admin/SettingsScreen.tsx`
- Modify: `frontend/src/modules/reports/ReportsScreen.tsx`
- Modify: `frontend/src/application/use-cases/reports/local-summary.ts`
- Test: `frontend/src/application/use-cases/reports/local-summary.test.ts`

**Interfaces:**
- Produces: `Expense { id, category, description, amountPesos, expenseDate }`.
- Produces: `ExpenseCategory { id, name, active }`.
- Produces: `LocalSummary.byExpenseCategory: Array<{ name: string; amountPesos: number }>`.
- Consumes: endpoints de la Tarea 7.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `ExpensesScreen.test.tsx`, con `request` mockeado, verificar que el formulario exige una categoría y envía `expenseCategoryId`. En `local-summary.test.ts`, verificar que `dailySummary` mezcla `byExpenseCategory` del servidor y que sin conexión devuelve `[]`.

- [ ] **Step 2: Correr las pruebas y ver el fallo**

Run: `cd frontend && npm test -- src/modules/expenses/ExpensesScreen.test.tsx src/application/use-cases/reports/local-summary.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`ExpensesScreen` carga `/api/expenses/categories`, muestra un `<select>` obligatorio con las activas, envía `expenseCategoryId` y muestra el nombre de la categoría en la tabla. `SettingsScreen` agrega una tarjeta “Categorías de gasto” con lista, alta y activar/desactivar (solo Admin). `local-summary.ts` agrega `byExpenseCategory: []` al resumen local y lo mezcla desde la respuesta remota de `dailySummary`. `ReportsScreen` muestra una lista “Gastos por categoría” cuando haya datos.

- [ ] **Step 4: Correr pruebas y build**

Run: `cd frontend && npm test -- src/modules/expenses/ExpensesScreen.test.tsx src/application/use-cases/reports/local-summary.test.ts && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/expenses frontend/src/modules/admin/SettingsScreen.tsx \
  frontend/src/modules/reports/ReportsScreen.tsx \
  frontend/src/application/use-cases/reports/local-summary.ts \
  frontend/src/application/use-cases/reports/local-summary.test.ts
git commit -m "feat: categorias de gasto en la interfaz y reportes"
```

---

### Task 9: Verificación de extremo a extremo y documentación

**Files:**
- Modify: `frontend/e2e/improvements.spec.ts`
- Modify: `docs/manual-operacion.md`
- Modify: `docs/endpoints.md`
- Modify: `docs/estado.md`

**Interfaces:**
- Consumes: todas las tareas anteriores.

- [ ] **Step 1: Agregar el escenario E2E de pago combinado**

En `frontend/e2e/improvements.spec.ts`, agregar un escenario que:

1. Inicie sesión, registre dispositivo y abra turno con $50.000.
2. Venda un producto de $7.000 y use “Dividir pago” con $4.000 efectivo y $3.000 tarjeta.
3. Verifique el mensaje de venta guardada.
4. Vaya a Caja y verifique que el efectivo esperado sea $54.000 (solo la porción en efectivo).

- [ ] **Step 2: Correr la suite completa**

Run:
```bash
cd backend && ./mvnw verify
cd frontend && npm test && npm run build
```
Expected: todas las pruebas verdes.

Run (con backend e2e levantado según `docs/e2e.md`):
```bash
cd frontend && npx playwright test e2e/improvements.spec.ts
```
Expected: PASS.

- [ ] **Step 3: Verificación manual de promociones y categorías**

1. Crear un combo con `saleDays` fuera del día actual y confirmar que no aparece en Venta; cambiarlo al día actual y confirmar que aparece.
2. Con un usuario MANAGER, cambiar el precio de una línea y confirmar que se guarda el motivo y que el total cambia.
3. Registrar un gasto con la categoría “Domicilios” y confirmar que el resumen muestra “Gastos por categoría”.
4. Desactivar una categoría y confirmar que ya no aparece en el formulario de gastos.

- [ ] **Step 4: Actualizar documentación**

En `docs/manual-operacion.md`: explicar promociones por día, cambio de precio con motivo, pago dividido, devolución con medio elegido y categorías de gasto. En `docs/endpoints.md`: agregar `saleDays`, `payments`, `expenseCategoryId` y los endpoints de categorías. En `docs/estado.md`: registrar la iteración como completada y el resultado de las pruebas.

- [ ] **Step 5: Commit**

```bash
git add frontend/e2e/improvements.spec.ts docs/manual-operacion.md docs/endpoints.md docs/estado.md
git commit -m "docs: mejoras de operacion y verificacion e2e"
```

---

## Self-Review

- **Cobertura del spec:** D-14 → Tareas 1–2; D-15 → Tareas 3–4; D-16 → Tareas 5–6; D-17 → Tarea 6; D-18 → Tareas 7–8. Verificación y documentación → Tarea 9.
- **Consistencia de tipos:** `saleDays` es `List<Integer>` en el backend y `number[]` en el frontend; `payments` es `List<PaymentCommand>` en el backend y `SalePaymentInput[]` en el frontend; `catalogUnitPricePesos` y `overrideReason` se llaman igual en ambos lados; `byExpenseCategory` usa `amountPesos` en ambos lados.
- **Compatibilidad:** la Tarea 5 mantiene el `method` legado en sync; la Tarea 3 usa `catalogUnitPricePesos = unitPricePesos` cuando el payload no lo trae; la Tarea 7 mantiene el texto `category` legado para clientes viejos mientras la UI nueva envía `expenseCategoryId`.
- **Riesgo conocido:** el cambio de precio de una línea se autoriza con el rol del usuario que viaja en la operación; el dispositivo ya es de confianza y el servidor valida que el usuario exista en el tenant/sede. Si en el futuro se requiere autenticación de usuario por operación, se agrega un token de usuario a la operación.
- **Datos existentes:** las columnas nuevas son nullable; no se reescriben ventas, gastos ni pagos históricos. La unicidad de `payments(sale_id)` se elimina en una migración explícita.
