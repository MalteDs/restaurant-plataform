# Caja: movimientos, gastos y cierre — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir Caja en el registro completo del efectivo del turno: ingresos, retiros, gastos pagados con caja, edición y anulación auditadas, cierre por denominaciones con nota, historial y CSV de cierre.

**Architecture:** El backend conserva `cash_movements` como fuente del arqueo y `expenses` como fuente de utilidad. Un gasto de caja crea ambas filas en la misma transacción de sincronización, enlazadas por `cash_movement_id`; una corrección anula la fila vieja y crea la nueva, sin reescribir histórico. El frontend sigue offline-first con Dexie: movimientos y cierres se guardan localmente y se encolan como `CASH_MOVEMENT` o `CLOSE_SHIFT`; las categorías de gasto se siembran y se actualizan desde el servidor.

**Tech Stack:** Spring Boot + JdbcTemplate + PostgreSQL/Liquibase, React + Vite + Dexie, JUnit 5 + Testcontainers, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-caja-operacion-design.md`

## Global Constraints

- Dinero en `bigint` y sufijo `_pesos`; nunca `float`, `double` ni `numeric`.
- Toda tabla operativa conserva `tenant_id` y `location_id`; las FKs nuevas son compuestas.
- Toda operación de caja funciona sin conexión. Nada de este plan puede exigir red para abrir, mover, editar, anular o cerrar.
- Los payloads antiguos deben seguir sincronizando: `CASH_MOVEMENT` sin gasto ni corrección, y `CLOSE_SHIFT` sin desglose ni nota.
- No se agrega un tipo nuevo a `sync_operation_type`; `CASH_MOVEMENT` transporta gasto y corrección.
- No se reescribe el histórico: un movimiento se anula con `voided_at` y `voided_by`; un turno cerrado no se edita.
- El arqueo lee solo `cash_movements` activos; la utilidad lee solo `expenses` activos. Nunca se suman las dos fuentes.
- Reportes y el formulario de gastos por fuera siguen siendo MANAGER/ADMIN. Caja y la lectura de categorías quedan para cualquier usuario autenticado.
- Textos de interfaz en español; controles con etiqueta accesible.
- Cada tarea termina con pruebas verdes y un commit propio.

## Review Focus

Estas son las fallas que más probablemente afecten a una persona usando la caja; cada una debe quedar cubierta por la prueba indicada en su tarea.

1. **Corregir un movimiento ya sincronizado**: el movimiento y el gasto viejos deben quedar anulados, el nuevo activo, y el arqueo debe reflejar solo el nuevo. Pruebas en Tareas 3 y 6.
2. **Corregir cuando la operación original fue rechazada**: la corrección debe crear el movimiento nuevo aunque no encuentre el viejo. Prueba en Tarea 3.
3. **Gasto de caja sin conexión**: las categorías deben estar locales desde el primer arranque y el gasto debe guardarse y encolarse sin red. Pruebas en Tareas 5, 6 y 9.
4. **Cierre con diferencia**: la caja debe exigir nota; el servidor debe aceptar un esperado distinto y guardar ambos. Pruebas en Tareas 4, 7 y 10.
5. **Doble conteo en Reportes**: un gasto de caja pendiente debe sumarse una vez, y uno anulado ya sincronizado debe restarse una vez. Prueba en Tarea 8.

## File Structure

| Área | Archivos principales |
|---|---|
| Migración | `backend/src/main/resources/db/changelog/025-caja-operacion.yaml`, `db.changelog-master.yaml` |
| Turnos backend | `shifts/CashMovementCommand.java`, `shifts/CloseShiftCommand.java`, `shifts/ShiftApplicationService.java` |
| Gastos backend | `expenses/ExpenseService.java`, `expenses/ExpenseController.java` |
| Reportes backend | `reports/ReportService.java` |
| Sync backend | `synchronization/SyncService.java` |
| Base local | `frontend/src/shared/expense-categories.ts`, `frontend/src/infrastructure/database/schema.ts` |
| Casos de uso frontend | `application/use-cases/expenses/expense-categories.ts`, `application/use-cases/shifts/cash-movement.ts`, `application/use-cases/shifts/close-shift.ts`, `shared/denominations.ts`, `application/use-cases/reports/local-summary.ts`, `application/use-cases/reports/shift-closing.ts` |
| Pantalla Caja | `frontend/src/modules/shifts/CashScreen.tsx`, `CashMovementPanel.tsx`, `ShiftClosePanel.tsx`, `ShiftHistory.tsx` |
| Sesión | `frontend/src/app/providers/AuthProvider.tsx` |
| E2E y docs | `frontend/e2e/helpers.ts`, `frontend/e2e/offline.spec.ts`, `frontend/e2e/cash-operations.spec.ts`, `docs/manual-operacion.md`, `docs/endpoints.md`, `docs/estado.md` |

---

### Task 1: Esquema de caja y lectura de categorías (backend)

**Files:**
- Create: `backend/src/main/resources/db/changelog/025-caja-operacion.yaml`
- Modify: `backend/src/main/resources/db/changelog/db.changelog-master.yaml`
- Modify: `backend/src/main/java/com/caja/expenses/ExpenseController.java`
- Test: `backend/src/test/java/com/caja/shared/SchemaIntegrityIT.java`
- Test: `backend/src/test/java/com/caja/reports/ReportsIT.java`

**Interfaces:**
- Produces columnas `shifts.counted_breakdown`, `shifts.close_note`, `cash_movements.voided_at`, `cash_movements.voided_by`, `cash_movements.replaces_movement_id`, `expenses.cash_movement_id`, `expenses.voided_at`, `expenses.voided_by`.
- Produces `GET /api/expenses/categories` para cualquier usuario autenticado.
- Consumes tablas existentes `shifts`, `cash_movements`, `expenses`, `users`.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `SchemaIntegrityIT`, agregar:

```java
@Test void cajaColumnsExist() {
  var columns = jdbc.queryForList(
      "select table_name || '.' || column_name from information_schema.columns "
          + "where table_schema = 'public'", String.class);
  assertTrue(columns.containsAll(Set.of(
      "shifts.counted_breakdown", "shifts.close_note",
      "cash_movements.voided_at", "cash_movements.voided_by",
      "cash_movements.replaces_movement_id",
      "expenses.cash_movement_id", "expenses.voided_at", "expenses.voided_by")));
}
```

En `ReportsIT`, agregar el import de `jsonPath` y:

```java
@Test void cashierCanReadExpenseCategories() throws Exception {
  var ctx = fixture();
  createCategory(ctx, "Fruver", "admin_categorias");

  mvc.perform(get("/api/expenses/categories")
          .header("Authorization", "Bearer " + token(ctx, "cajero_categorias", "CASHIER")))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$[0].name").exists());
}
```

- [ ] **Step 2: Correr las pruebas y ver el fallo**

Run: `cd backend && ./mvnw test -Dtest=SchemaIntegrityIT,ReportsIT`
Expected: FAIL por columnas y permiso inexistentes.

- [ ] **Step 3: Implementar la migración y el permiso**

`025-caja-operacion.yaml`:

```yaml
databaseChangeLog:
  - changeSet:
      id: 025-caja-operacion
      author: caja
      changes:
        - sql:
            sql: |
              alter table shifts
                add column counted_breakdown jsonb,
                add column close_note varchar(200);
              alter table shifts add constraint shifts_close_note_ck
                check (close_note is null or length(trim(close_note)) between 5 and 200);

              alter table cash_movements
                add column voided_at timestamptz,
                add column voided_by uuid,
                add column replaces_movement_id uuid;
              alter table cash_movements
                add constraint cash_movements_id_tenant_location_uk
                unique (id, tenant_id, location_id);
              alter table cash_movements add constraint cash_movements_void_ck
                check ((voided_at is null and voided_by is null)
                    or (voided_at is not null and voided_by is not null));
              alter table cash_movements add constraint cash_movements_voided_by_fk
                foreign key (voided_by, tenant_id, location_id)
                references users(id, tenant_id, location_id);
              alter table cash_movements add constraint cash_movements_replaces_fk
                foreign key (replaces_movement_id, tenant_id, location_id)
                references cash_movements(id, tenant_id, location_id);

              alter table expenses
                add column cash_movement_id uuid,
                add column voided_at timestamptz,
                add column voided_by uuid;
              alter table expenses add constraint expenses_void_ck
                check ((voided_at is null and voided_by is null)
                    or (voided_at is not null and voided_by is not null));
              alter table expenses add constraint expenses_voided_by_fk
                foreign key (voided_by, tenant_id, location_id)
                references users(id, tenant_id, location_id);
              alter table expenses add constraint expenses_cash_movement_fk
                foreign key (cash_movement_id, tenant_id, location_id)
                references cash_movements(id, tenant_id, location_id);

              create unique index expenses_cash_movement_uk
                on expenses (cash_movement_id) where cash_movement_id is not null;
              create index cash_movements_shift_active_idx
                on cash_movements (shift_id) where voided_at is null;
              create index expenses_active_report_idx
                on expenses (tenant_id, location_id, expense_date) where voided_at is null;
```

Incluir el archivo en `db.changelog-master.yaml`.

En `ExpenseController`, cambiar el `@PreAuthorize` de `categories` a `@PreAuthorize("isAuthenticated()")`.

- [ ] **Step 4: Correr las pruebas y verlas pasar**

Run: `cd backend && ./mvnw test -Dtest=SchemaIntegrityIT,ReportsIT`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/changelog/025-caja-operacion.yaml \
  backend/src/main/resources/db/changelog/db.changelog-master.yaml \
  backend/src/main/java/com/caja/expenses/ExpenseController.java \
  backend/src/test/java/com/caja/shared/SchemaIntegrityIT.java \
  backend/src/test/java/com/caja/reports/ReportsIT.java
git commit -m "feat: esquema de movimientos y gastos de caja"
```

---

### Task 2: Movimiento de efectivo y gasto de caja (backend)

**Files:**
- Create: `backend/src/main/java/com/caja/shifts/CashMovementCommand.java`
- Modify: `backend/src/main/java/com/caja/shifts/ShiftApplicationService.java`
- Modify: `backend/src/main/java/com/caja/expenses/ExpenseService.java`
- Modify: `backend/src/main/java/com/caja/synchronization/SyncService.java`
- Test: `backend/src/test/java/com/caja/synchronization/SyncIT.java`

**Interfaces:**
- Produces `CashMovementCommand(UUID tenantId, UUID locationId, UUID shiftId, UUID userId, UUID movementId, String type, long amountPesos, String reason, String expenseCategoryName, UUID replacesMovementId, boolean voided, LocalDate operationalDate)`.
- Produces `ShiftApplicationService.movement(CashMovementCommand command): void`.
- Produces `ExpenseService.createFromCashMovement(UUID tenantId, UUID locationId, UUID userId, UUID cashMovementId, String categoryName, String description, long amountPesos, LocalDate expenseDate): UUID`.
- Consumes columnas de la Tarea 1.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `SyncIT`, inyectar `ShiftApplicationService shifts` y agregar helpers `category(Ctx, String)` y `cashMovementOperation(...)`. El helper genera un UUID de movimiento, lo usa como `entityId` de la operación y lo devuelve en el `result` como `movementId`. El payload es:

```java
Map.of("shiftId", ctx.shiftId().toString(), "movementType", type,
    "amountPesos", amountPesos, "reason", reason)
```

más `expenseCategoryName`, `replacesMovementId` y `voided` solo cuando apliquen.

Pruebas:

```java
@Test void cashExpenseCreatesMovementAndExpense() {
  var ctx = fixture();
  category(ctx, "Fruver");
  var result = push(ctx, List.of(cashMovementOperation(ctx, "op-expense", 1,
      "WITHDRAWAL", 5000, "compra lechuga", "Fruver", Instant.now())));

  assertEquals("APPLIED", syncStatus(result.get(0)));
  assertEquals(45000L, shifts.expectedCash(ctx.tenantId(), ctx.locationId(), ctx.shiftId()));
  assertEquals(1, jdbc.queryForObject("select count(*) from cash_movements where tenant_id = ? "
      + "and voided_at is null", Integer.class, ctx.tenantId()));
  var expense = jdbc.queryForMap("select category, amount_pesos, cash_movement_id from expenses "
      + "where tenant_id = ?", ctx.tenantId());
  assertEquals("Fruver", expense.get("category"));
  assertEquals(5000L, ((Number) expense.get("amount_pesos")).longValue());
  assertTrue(expense.get("cash_movement_id") != null);
}

@Test void cashMovementWithoutExpenseDoesNotCreateExpense() {
  var ctx = fixture();
  var result = push(ctx, List.of(cashMovementOperation(ctx, "op-deposit", 1,
      "DEPOSIT", 10000, "fondo adicional", null, Instant.now())));

  assertEquals("APPLIED", syncStatus(result.get(0)));
  assertEquals(60000L, shifts.expectedCash(ctx.tenantId(), ctx.locationId(), ctx.shiftId()));
  assertEquals(0, jdbc.queryForObject("select count(*) from expenses where tenant_id = ?",
      Integer.class, ctx.tenantId()));
}

@Test void cashMovementRequiresReason() {
  var ctx = fixture();
  var result = push(ctx, List.of(cashMovementOperation(ctx, "op-short", 1,
      "WITHDRAWAL", 5000, "abcd", null, Instant.now())));

  assertEquals("REJECTED", syncStatus(result.get(0)));
  assertEquals(0, jdbc.queryForObject("select count(*) from cash_movements where tenant_id = ?",
      Integer.class, ctx.tenantId()));
}

@Test void cashMovementRequiresOpenShift() {
  var ctx = fixture();
  jdbc.update("update shifts set closed_at = now() where id = ?", ctx.shiftId());
  var result = push(ctx, List.of(cashMovementOperation(ctx, "op-closed", 1,
      "WITHDRAWAL", 5000, "compra lechuga", "Fruver", Instant.now())));

  assertEquals("REJECTED", syncStatus(result.get(0)));
}

@Test void legacyCashMovementWithoutExpenseStillApplies() {
  var ctx = fixture();
  var result = push(ctx, List.of(cashMovementOperation(ctx, "op-legacy-cash", 1,
      "DEPOSIT", 5000, "cambio", null, Instant.now())));

  assertEquals("APPLIED", syncStatus(result.get(0)));
  assertEquals(55000L, shifts.expectedCash(ctx.tenantId(), ctx.locationId(), ctx.shiftId()));
  assertEquals(0, jdbc.queryForObject("select count(*) from expenses where tenant_id = ?",
      Integer.class, ctx.tenantId()));
}
```

- [ ] **Step 2: Correr las pruebas y ver el fallo**

Run: `cd backend && ./mvnw test -Dtest=SyncIT`
Expected: FAIL porque el payload no crea el gasto.

- [ ] **Step 3: Implementar**

`CashMovementCommand` es un record con los campos de la interfaz.

En `ShiftApplicationService.movement`:
- Exigir tipo `DEPOSIT` o `WITHDRAWAL`.
- Validar motivo de 5 a 200 y monto mayor que cero.
- Exigir turno abierto del tenant/sede.
- Insertar en `cash_movements` con `movementId` y tipo `DEPOSIT`/`WITHDRAWAL`.
- Si `expenseCategoryName` no está vacío, llamar a `expenses.createFromCashMovement(...)`.
- Registrar auditoría `CASH_MOVEMENT_CREATED`.

En `ExpenseService.createFromCashMovement`:
- Recortar el nombre de categoría y exigir entre 1 y 100 caracteres.
- Buscar el id de la categoría por nombre en tenant/sede, activa o inactiva.
- Insertar `expenses` con `category` congelado, `expense_category_id` si se encontró, `cash_movement_id`, descripción y fecha.
- Registrar `EXPENSE_CREATED` con `source = "CASH"`.

En `SyncService.validate`, agregar `CASH_MOVEMENT` a la comprobación de turno abierto. Si la operación no es una anulación, validar monto mayor que cero y motivo de 5 a 200; si es una anulación (`payload.voided`), solo exigir `replacesMovementId`. En `dispatch`, construir `CashMovementCommand` con `movementId = operation.entityId()` (o UUID aleatorio si viene nulo) y pasar los campos nuevos.

- [ ] **Step 4: Correr las pruebas y verlas pasar**

Run: `cd backend && ./mvnw test -Dtest=SyncIT`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/caja/shifts backend/src/main/java/com/caja/expenses/ExpenseService.java \
  backend/src/main/java/com/caja/synchronization/SyncService.java \
  backend/src/test/java/com/caja/synchronization/SyncIT.java
git commit -m "feat: movimientos de caja y gasto desde el cajon"
```

---

### Task 3: Corrección, anulación y reportes sin anulados (backend)

**Files:**
- Modify: `backend/src/main/java/com/caja/shifts/ShiftApplicationService.java`
- Modify: `backend/src/main/java/com/caja/expenses/ExpenseService.java`
- Modify: `backend/src/main/java/com/caja/reports/ReportService.java`
- Modify: `backend/src/main/java/com/caja/synchronization/SyncService.java`
- Test: `backend/src/test/java/com/caja/synchronization/SyncIT.java`
- Test: `backend/src/test/java/com/caja/reports/ReportsIT.java`

**Interfaces:**
- Produce `CASH_MOVEMENT` con `replacesMovementId` y `voided`.
- Produce `ExpenseService.voidByCashMovement(UUID tenantId, UUID locationId, UUID userId, UUID cashMovementId): void`.
- `expectedCash` excluye movimientos con `voided_at`.
- `ReportService` y `ExpenseService.list` excluyen gastos con `voided_at`.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `SyncIT`:

```java
@Test void correctionVoidsOldAndCreatesNew() {
  var ctx = fixture();
  category(ctx, "Fruver");
  category(ctx, "Aseo");
  var first = push(ctx, List.of(cashMovementOperation(ctx, "op-m1", 1,
      "WITHDRAWAL", 5000, "compra lechuga", "Fruver", Instant.now())));
  var oldId = UUID.fromString((String) result(first.get(0), "movementId"));

  var second = push(ctx, List.of(correctionOperation(ctx, "op-m2", 2, oldId,
      "WITHDRAWAL", 3000, "compra lechuga", "Aseo", false, Instant.now())));

  assertEquals("APPLIED", syncStatus(second.get(0)));
  assertEquals(47000L, shifts.expectedCash(ctx.tenantId(), ctx.locationId(), ctx.shiftId()));
  assertEquals(1, jdbc.queryForObject("select count(*) from cash_movements where id = ? "
      + "and voided_at is not null", Integer.class, oldId));
  assertEquals(1, jdbc.queryForObject("select count(*) from expenses where voided_at is null "
      + "and category = 'Aseo'", Integer.class));
  assertEquals(1, jdbc.queryForObject("select count(*) from expenses where voided_at is not null "
      + "and category = 'Fruver'", Integer.class));
}

@Test void voidRestoresExpectedCash() {
  var ctx = fixture();
  category(ctx, "Fruver");
  var first = push(ctx, List.of(cashMovementOperation(ctx, "op-void-1", 1,
      "WITHDRAWAL", 5000, "compra lechuga", "Fruver", Instant.now())));
  var oldId = UUID.fromString((String) result(first.get(0), "movementId"));

  var second = push(ctx, List.of(correctionOperation(ctx, "op-void-2", 2, oldId,
      null, 0, null, null, true, Instant.now())));

  assertEquals("APPLIED", syncStatus(second.get(0)));
  assertEquals(50000L, shifts.expectedCash(ctx.tenantId(), ctx.locationId(), ctx.shiftId()));
  assertEquals(0, jdbc.queryForObject("select count(*) from cash_movements where tenant_id = ? "
      + "and voided_at is null", Integer.class, ctx.tenantId()));
  assertEquals(0, jdbc.queryForObject("select count(*) from expenses where tenant_id = ? "
      + "and voided_at is null", Integer.class, ctx.tenantId()));
}

@Test void correctionWithoutOriginalStillCreatesNew() {
  var ctx = fixture();
  var missing = UUID.randomUUID();
  var result = push(ctx, List.of(correctionOperation(ctx, "op-missing", 1, missing,
      "DEPOSIT", 2000, "reposicion", null, false, Instant.now())));

  assertEquals("APPLIED", syncStatus(result.get(0)));
  assertEquals(52000L, shifts.expectedCash(ctx.tenantId(), ctx.locationId(), ctx.shiftId()));
  assertEquals(0, jdbc.queryForObject("select count(*) from cash_movements where id = ?",
      Integer.class, missing));
}

@Test void correctionOnClosedShiftIsRejected() {
  var ctx = fixture();
  category(ctx, "Fruver");
  var first = push(ctx, List.of(cashMovementOperation(ctx, "op-closed-1", 1,
      "WITHDRAWAL", 5000, "compra lechuga", "Fruver", Instant.now())));
  var oldId = UUID.fromString((String) result(first.get(0), "movementId"));
  jdbc.update("update shifts set closed_at = now() where id = ?", ctx.shiftId());

  var second = push(ctx, List.of(correctionOperation(ctx, "op-closed-2", 2, oldId,
      "WITHDRAWAL", 3000, "compra lechuga", "Aseo", false, Instant.now())));

  assertEquals("REJECTED", syncStatus(second.get(0)));
  assertEquals(0, jdbc.queryForObject("select count(*) from cash_movements where tenant_id = ? "
      + "and voided_at is not null", Integer.class, ctx.tenantId()));
}
```

El `CASH_MOVEMENT` de la Tarea 2 debe devolver `movementId` en `result`. En `SyncIT`, extender el helper de la Tarea 2 con esta firma:

```java
private SyncOperation correctionOperation(Ctx ctx, String operationId, long seq,
    UUID replacesMovementId, String type, long amountPesos, String reason,
    String expenseCategoryName, boolean voided, Instant clientCreatedAt)
```

Cuando `voided` es verdadero, el payload lleva solo `shiftId`, `replacesMovementId` y `voided: true`; los demás campos se omiten.

En `ReportsIT`:

```java
@Test void summaryExcludesVoidedExpenses() throws Exception {
  var ctx = fixture();
  expense(ctx, 10000);
  var voidedId = UUID.randomUUID();
  jdbc.update("insert into expenses(id, tenant_id, location_id, user_id, category, description, "
      + "amount_pesos, expense_date, voided_at, voided_by) values (?, ?, ?, ?, 'Aseo', 'Jabon', "
      + "5000, current_date, now(), ?)", voidedId, ctx.tenantId(), ctx.locationId(), ctx.userId(),
      ctx.userId());

  assertEquals(10000, summary(ctx).get("expensesPesos"));
  assertTrue(((List<?>) summary(ctx).get("byExpenseCategory")).stream()
      .noneMatch(row -> "Aseo".equals(((Map<?, ?>) row).get("name"))));
}
```

- [ ] **Step 2: Correr las pruebas y ver el fallo**

Run: `cd backend && ./mvnw test -Dtest=SyncIT,ReportsIT`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `ShiftApplicationService.movement`:
- Si `replacesMovementId` no es nulo, buscar el movimiento viejo en tenant/sede/turno. Si existe y no está anulado, marcarlo con `voided_at = now()` y `voided_by`, y llamar a `expenses.voidByCashMovement(...)`. Si no existe, continuar sin error.
- Si `voided`, terminar sin insertar y sin validar monto ni motivo.
- Si no, insertar el movimiento nuevo con `replaces_movement_id` solo cuando el viejo se encontró.
- Auditar `CASH_MOVEMENT_CORRECTED` o `CASH_MOVEMENT_VOIDED`.

En `expectedCash`, agregar `and voided_at is null` a las consultas de depósitos y retiros.

En `ExpenseService.voidByCashMovement`, actualizar `expenses` con `voided_at = now(), voided_by = ?` donde `cash_movement_id = ? and voided_at is null` y auditar. Agregar `and voided_at is null` a `list`.

En `ReportService`, agregar `and voided_at is null` a las dos consultas de gastos.

En `SyncService.dispatch`, leer `replacesMovementId` y `voided` del payload y devolver `movementId` en el resultado.

- [ ] **Step 4: Correr las pruebas y verlas pasar**

Run: `cd backend && ./mvnw test -Dtest=SyncIT,ReportsIT`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/caja/shifts/ShiftApplicationService.java \
  backend/src/main/java/com/caja/expenses/ExpenseService.java \
  backend/src/main/java/com/caja/reports/ReportService.java \
  backend/src/main/java/com/caja/synchronization/SyncService.java \
  backend/src/test/java/com/caja/synchronization/SyncIT.java \
  backend/src/test/java/com/caja/reports/ReportsIT.java
git commit -m "feat: correccion y anulacion de movimientos de caja"
```

---

### Task 4: Cierre con denominaciones y nota (backend)

**Files:**
- Modify: `backend/src/main/java/com/caja/shifts/CloseShiftCommand.java`
- Modify: `backend/src/main/java/com/caja/shifts/ShiftApplicationService.java`
- Modify: `backend/src/main/java/com/caja/synchronization/SyncService.java`
- Test: `backend/src/test/java/com/caja/synchronization/SyncIT.java`

**Interfaces:**
- Produce `CloseShiftCommand(UUID tenantId, UUID locationId, UUID shiftId, long countedCashPesos, Long expectedLocalPesos, UUID userId, Map<Integer, Integer> countedBreakdown, String closeNote)`.
- Conserva el constructor de 4 argumentos para pruebas y compatibilidad.
- `CLOSE_SHIFT` acepta `countedBreakdown` y `closeNote`.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `SyncIT`, helper `closeOperation(...)` con payload `shiftId`, `countedCashPesos`, `expectedPesos`, `countedBreakdown`, `closeNote`.

```java
@Test void closeStoresBreakdownAndNote() {
  var ctx = fixture();
  var result = push(ctx, List.of(closeOperation(ctx, "op-close", 1, 43000, 43000,
      Map.of(20000, 2, 1000, 3), "faltante revisado", Instant.now())));

  assertEquals("APPLIED", syncStatus(result.get(0)));
  assertEquals("2", jdbc.queryForObject("select counted_breakdown->>'20000' from shifts "
      + "where id = ?", String.class, ctx.shiftId()));
  assertEquals("faltante revisado", jdbc.queryForObject("select close_note from shifts "
      + "where id = ?", String.class, ctx.shiftId()));
}

@Test void breakdownMustMatchCounted() {
  var ctx = fixture();
  var result = push(ctx, List.of(closeOperation(ctx, "op-close-bad-sum", 1, 42000, 42000,
      Map.of(20000, 2, 1000, 3), "faltante", Instant.now())));

  assertEquals("REJECTED", syncStatus(result.get(0)));
  assertEquals(0, jdbc.queryForObject("select count(*) from shifts where id = ? "
      + "and closed_at is not null", Integer.class, ctx.shiftId()));
}

@Test void invalidDenominationIsRejected() {
  var ctx = fixture();
  var result = push(ctx, List.of(closeOperation(ctx, "op-close-bad-den", 1, 1234, 1234,
      Map.of(1234, 1), null, Instant.now())));

  assertEquals("REJECTED", syncStatus(result.get(0)));
}

@Test void shortCloseNoteIsRejected() {
  var ctx = fixture();
  var result = push(ctx, List.of(closeOperation(ctx, "op-close-short-note", 1, 49000, 49000,
      null, "abc", Instant.now())));

  assertEquals("REJECTED", syncStatus(result.get(0)));
}

@Test void legacyCloseWithoutBreakdownStillApplies() {
  var ctx = fixture();
  var result = push(ctx, List.of(closeOperation(ctx, "op-close-legacy", 1, 50000, 50000,
      null, null, Instant.now())));

  assertEquals("APPLIED", syncStatus(result.get(0)));
  assertEquals(50000L, jdbc.queryForObject("select counted_cash_pesos from shifts where id = ?",
      Long.class, ctx.shiftId()));
}

@Test void serverExpectedDivergenceIsStored() {
  var ctx = fixture();
  push(ctx, List.of(closeOperation(ctx, "op-close-diff", 1, 49000, 49000, null, null,
      Instant.now())));
  var row = jdbc.queryForMap("select expected_local_pesos, expected_server_pesos, "
      + "difference_pesos from shifts where id = ?", ctx.shiftId());
  assertEquals(49000L, ((Number) row.get("expected_local_pesos")).longValue());
  assertEquals(50000L, ((Number) row.get("expected_server_pesos")).longValue());
  assertEquals(-1000L, ((Number) row.get("difference_pesos")).longValue());
}
```

- [ ] **Step 2: Correr las pruebas y ver el fallo**

Run: `cd backend && ./mvnw test -Dtest=SyncIT`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `CloseShiftCommand`, agregar los dos campos y conservar el constructor de 4 argumentos.

En `ShiftApplicationService.close`:
- Validar que la nota, si viene, tenga 5–200 caracteres.
- Validar que el desglose use solo las denominaciones `100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50`, con cantidades no negativas, y que la suma sea igual a `countedCashPesos`.
- Guardar `counted_breakdown` como JSONB con `ObjectMapper` y `close_note`.
- Mantener el cálculo actual de `expected_local_pesos`, `expected_server_pesos` y `difference_pesos`; no rechazar por diferencia.

En `SyncService.validate`, para `CLOSE_SHIFT`, validar antes del dispatch que la nota, si viene, tenga 5–200 caracteres, y que el desglose use denominaciones permitidas, cantidades no negativas y suma igual al contado. Esto evita que una validación dentro de la transacción marque el lote como rollback-only. En `dispatch`, leer `countedBreakdown` y `closeNote` del payload y pasarlos al comando.

- [ ] **Step 4: Correr las pruebas y verlas pasar**

Run: `cd backend && ./mvnw test -Dtest=SyncIT`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/caja/shifts/CloseShiftCommand.java \
  backend/src/main/java/com/caja/shifts/ShiftApplicationService.java \
  backend/src/main/java/com/caja/synchronization/SyncService.java \
  backend/src/test/java/com/caja/synchronization/SyncIT.java
git commit -m "feat: cierre de turno por denominaciones y nota"
```

---

### Task 5: Esquema local y categorías sin conexión (frontend)

**Files:**
- Create: `frontend/src/shared/expense-categories.ts`
- Modify: `frontend/src/infrastructure/database/schema.ts`
- Create: `frontend/src/application/use-cases/expenses/expense-categories.ts`
- Test: `frontend/src/application/use-cases/expenses/expense-categories.test.ts`
- Modify: `frontend/src/app/providers/AuthProvider.tsx`

**Interfaces:**
- Produce `DEFAULT_EXPENSE_CATEGORIES: Array<{ name: string; sortOrder: number; active: boolean }>`.
- Produce `ExpenseCategoryRow`.
- Produce `refreshExpenseCategories(database: CajaDb, fetcher?: (path: string) => Promise<ExpenseCategoryDto[]>): Promise<void>`.
- Produce `availableExpenseCategories(database: CajaDb): Promise<string[]>`; si no hay ninguna, devuelve `['Otros']`.
- `ShiftRow` agrega `countedBreakdown?: Record<string, number> | null`, `closeNote?: string | null`, `closedBy?: string | null`.
- `CashMovementRow` agrega `expenseCategoryName?: string | null`, `voidedAt?: string | null`, `voidedBy?: string | null`, `replacesMovementId?: string | null`.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `expense-categories.test.ts`:

```ts
it('siembra las seis categorías al crear la base', async () => {
  const db = openDb(`test-categories-${crypto.randomUUID()}`)
  expect(await db.expenseCategories.count()).toBe(6)
  db.close()
})

it('reemplaza la caché por las categorías activas del servidor', async () => {
  const db = openDb(`test-categories-${crypto.randomUUID()}`)
  await refreshExpenseCategories(db, async () => [
    { id: '1', name: 'Fruver', sortOrder: 1, active: true },
    { id: '2', name: 'Vieja', sortOrder: 2, active: false }
  ])
  expect(await availableExpenseCategories(db)).toEqual(['Fruver'])
  db.close()
})

it('si el servidor falla, conserva la caché', async () => {
  const db = openDb(`test-categories-${crypto.randomUUID()}`)
  await expect(refreshExpenseCategories(db, async () => { throw new Error('sin red') }))
    .rejects.toThrow()
  expect(await availableExpenseCategories(db)).toContain('Fruver')
  db.close()
})
```

- [ ] **Step 2: Correr las pruebas y ver el fallo**

Run: `cd frontend && npm test -- src/application/use-cases/expenses/expense-categories.test.ts`
Expected: FAIL porque la tabla y los helpers no existen.

- [ ] **Step 3: Implementar**

`shared/expense-categories.ts` exporta las seis categorías actuales con su orden: Domicilios 1, Fruver 2, Insumos 3, Aseo 4, Servicios 5, Otros 6.

En `schema.ts`:
- Agregar `expenseCategories!: Table<ExpenseCategoryRow, string>`.
- Agregar la versión 4 con `expenseCategories: 'name, sortOrder'` y un `upgrade` que haga `bulkPut(DEFAULT_EXPENSE_CATEGORIES)`.
- Agregar los campos a `ShiftRow` y `CashMovementRow`.

`expense-categories.ts`:
- `refreshExpenseCategories` llama a `/api/expenses/categories`, filtra activas, ordena por `sortOrder` y reemplaza la tabla dentro de una transacción. Si la respuesta no trae activas, no borra la caché.
- `availableExpenseCategories` devuelve los nombres activos ordenados; si la tabla está vacía, `['Otros']`.

En `AuthProvider`, llamar a `refreshExpenseCategories(db)` después de `syncCatalog` en el login y dentro del intervalo de 30 minutos, con `catch` silencioso.

- [ ] **Step 4: Correr pruebas y build**

Run: `cd frontend && npm test -- src/application/use-cases/expenses/expense-categories.test.ts && npm run build`
Expected: PASS y build sin errores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/expense-categories.ts frontend/src/infrastructure/database/schema.ts \
  frontend/src/application/use-cases/expenses/expense-categories.ts \
  frontend/src/application/use-cases/expenses/expense-categories.test.ts \
  frontend/src/app/providers/AuthProvider.tsx
git commit -m "feat: categorias de gasto disponibles sin conexion"
```

---

### Task 6: Movimiento, edición y anulación (frontend)

**Files:**
- Create: `frontend/src/application/use-cases/shifts/cash-movement.ts`
- Test: `frontend/src/application/use-cases/shifts/cash-movement.test.ts`
- Modify: `frontend/src/application/use-cases/shifts/close-shift.ts`

**Interfaces:**
- Produce `CashMovementInput { type: 'DEPOSIT' | 'WITHDRAWAL'; amountPesos: number; reason: string; isExpense?: boolean; expenseCategoryName?: string | null }`.
- Produce `registerCashMovement(database: CajaDb, input: CashMovementInput, deps?: { now?: Date; userId?: string }): Promise<{ movementId: string }>`.
- Produce `editCashMovement(database: CajaDb, movementId: string, input: CashMovementInput, deps?): Promise<{ movementId: string }>`.
- Produce `voidCashMovement(database: CajaDb, movementId: string, deps?): Promise<void>`.
- `expectedCash` ignora movimientos con `voidedAt`.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `cash-movement.test.ts`, con `openDb`, usuario `u1` y turno abierto:

```ts
it('registra un gasto de caja y actualiza el esperado', async () => {
  const db = await seed()
  const out = await registerCashMovement(db, {
    type: 'WITHDRAWAL', amountPesos: 5000, reason: 'compra lechuga',
    isExpense: true, expenseCategoryName: 'Fruver'
  })
  expect(await expectedCash(db, 'shift-1')).toBe(45000)
  const op = await db.operations.where('type').equals('CASH_MOVEMENT').first()
  expect(op?.payload).toMatchObject({
    movementType: 'WITHDRAWAL', amountPesos: 5000, reason: 'compra lechuga',
    expenseCategoryName: 'Fruver'
  })
  expect((await db.cashMovements.get(out.movementId))?.expenseCategoryName).toBe('Fruver')
})

it('exige categoría cuando es gasto', async () => {
  const db = await seed()
  await expect(registerCashMovement(db, {
    type: 'WITHDRAWAL', amountPesos: 5000, reason: 'compra lechuga', isExpense: true
  })).rejects.toThrow(/categor/i)
})

it('edita un movimiento y deja el viejo anulado', async () => {
  const db = await seed()
  const first = await registerCashMovement(db, {
    type: 'WITHDRAWAL', amountPesos: 5000, reason: 'compra lechuga',
    isExpense: true, expenseCategoryName: 'Fruver'
  })
  const second = await editCashMovement(db, first.movementId, {
    type: 'WITHDRAWAL', amountPesos: 3000, reason: 'compra lechuga',
    isExpense: true, expenseCategoryName: 'Aseo'
  })

  expect(await expectedCash(db, 'shift-1')).toBe(47000)
  expect((await db.cashMovements.get(first.movementId))?.voidedAt).toBeTruthy()
  expect((await db.cashMovements.get(second.movementId))?.replacesMovementId)
    .toBe(first.movementId)
})

it('anula un movimiento y restaura el esperado', async () => {
  const db = await seed()
  const out = await registerCashMovement(db, {
    type: 'WITHDRAWAL', amountPesos: 5000, reason: 'compra lechuga'
  })
  await voidCashMovement(db, out.movementId)
  expect(await expectedCash(db, 'shift-1')).toBe(50000)
  const op = await db.operations.where('type').equals('CASH_MOVEMENT').last()
  expect(op?.payload).toMatchObject({ voided: true, replacesMovementId: out.movementId })
})

it('no permite editar ni anular un turno cerrado', async () => {
  const db = await seed()
  const out = await registerCashMovement(db, {
    type: 'WITHDRAWAL', amountPesos: 5000, reason: 'compra lechuga'
  })
  await db.shifts.update('shift-1', { closedAt: new Date().toISOString() })

  await expect(editCashMovement(db, out.movementId, {
    type: 'WITHDRAWAL', amountPesos: 3000, reason: 'compra lechuga'
  })).rejects.toThrow(/turno abierto/i)
  await expect(voidCashMovement(db, out.movementId)).rejects.toThrow(/turno abierto/i)
})
```

- [ ] **Step 2: Correr las pruebas y ver el fallo**

Run: `cd frontend && npm test -- src/application/use-cases/shifts/cash-movement.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`cash-movement.ts`:
- Validar monto entero mayor que cero, motivo de 5 a 200 y categoría obligatoria cuando `isExpense`.
- `isExpense` solo se permite con `WITHDRAWAL`.
- Leer el turno abierto y el usuario activo dentro de la transacción.
- Crear el movimiento, encolar `CASH_MOVEMENT` con `entityId` igual al id del movimiento y payload `{ shiftId, movementType, amountPesos, reason, expenseCategoryName }`.
- En edición, leer el movimiento viejo, marcarlo con `voidedAt`/`voidedBy`, crear el nuevo con `replacesMovementId` y encolar `{ ..., replacesMovementId: old.id }`.
- En anulación, marcar el viejo y encolar `{ ..., replacesMovementId: old.id, voided: true }`.
- Llamar a `notifyOperationQueued()` al final.

En `close-shift.ts`, filtrar `!movement.voidedAt` al sumar depósitos y retiros.

- [ ] **Step 4: Correr las pruebas y verlas pasar**

Run: `cd frontend && npm test -- src/application/use-cases/shifts/cash-movement.test.ts src/application/use-cases/shifts/close-shift.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/application/use-cases/shifts/cash-movement.ts \
  frontend/src/application/use-cases/shifts/cash-movement.test.ts \
  frontend/src/application/use-cases/shifts/close-shift.ts
git commit -m "feat: movimientos de caja editables y anulables"
```

---

### Task 7: Cierre por denominaciones y nota (frontend)

**Files:**
- Create: `frontend/src/shared/denominations.ts`
- Test: `frontend/src/shared/denominations.test.ts`
- Modify: `frontend/src/application/use-cases/shifts/close-shift.ts`
- Test: `frontend/src/application/use-cases/shifts/close-shift.test.ts`

**Interfaces:**
- Produce `DENOMINATIONS: readonly number[]`.
- Produce `denominationTotal(breakdown: Record<string, number>): number`.
- `CloseShiftInput` agrega `countedBreakdown?: Record<string, number>` y `closeNote?: string`.
- `CloseShiftResult` no cambia.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `denominations.test.ts`:

```ts
it('suma el desglose de billetes y monedas', () => {
  expect(denominationTotal({ '20000': 2, '1000': 3 })).toBe(43000)
})
```

En `close-shift.test.ts`, actualizar la prueba existente para pasar nota por la diferencia y agregar:

```ts
it('exige nota cuando hay diferencia', async () => {
  const db = await seed()
  await expect(closeShift(db, { countedCashPesos: 60000, countedBreakdown: { '10000': 6 } }))
    .rejects.toThrow(/nota/i)
})

it('guarda el desglose y la nota en el turno y en la cola', async () => {
  const db = await seed()
  const result = await closeShift(db, {
    countedCashPesos: 63000,
    countedBreakdown: { '20000': 3, '1000': 3 },
    closeNote: 'faltante revisado'
  })
  expect(result.differencePesos).toBe(-500)
  const shift = await db.shifts.get('shift-1')
  expect(shift?.countedBreakdown).toEqual({ '20000': 3, '1000': 3 })
  expect(shift?.closeNote).toBe('faltante revisado')
  expect(shift?.closedBy).toBe('u1')
  const op = await db.operations.where('type').equals('CLOSE_SHIFT').first()
  expect(op?.payload).toMatchObject({
    countedBreakdown: { '20000': 3, '1000': 3 }, closeNote: 'faltante revisado'
  })
})

it('rechaza un desglose que no suma el contado', async () => {
  const db = await seed()
  await expect(closeShift(db, {
    countedCashPesos: 43000, countedBreakdown: { '20000': 2 }, closeNote: 'faltante'
  })).rejects.toThrow(/desglose|contado/i)
})
```

- [ ] **Step 2: Correr las pruebas y ver el fallo**

Run: `cd frontend && npm test -- src/shared/denominations.test.ts src/application/use-cases/shifts/close-shift.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`denominations.ts` exporta `[100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50]` y suma `denominación × cantidad`.

En `close-shift.ts`:
- Si viene `countedBreakdown`, validar denominaciones permitidas, cantidades enteras no negativas y suma igual a `countedCashPesos`.
- Calcular la diferencia.
- Si la diferencia no es cero, exigir `closeNote` de 5 a 200; si es cero y viene, validar longitud.
- Guardar `countedBreakdown`, `closeNote` y `closedBy` (el usuario activo) en el turno y en el payload.

- [ ] **Step 4: Correr las pruebas y verlas pasar**

Run: `cd frontend && npm test -- src/shared/denominations.test.ts src/application/use-cases/shifts/close-shift.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/denominations.ts frontend/src/shared/denominations.test.ts \
  frontend/src/application/use-cases/shifts/close-shift.ts \
  frontend/src/application/use-cases/shifts/close-shift.test.ts
git commit -m "feat: cierre por denominaciones con nota"
```

---

### Task 8: Resumen local y CSV de cierre (frontend)

**Files:**
- Modify: `frontend/src/application/use-cases/reports/local-summary.ts`
- Test: `frontend/src/application/use-cases/reports/local-summary.test.ts`
- Create: `frontend/src/application/use-cases/reports/shift-closing.ts`
- Test: `frontend/src/application/use-cases/reports/shift-closing.test.ts`

**Interfaces:**
- `LocalSummary.expensesPesos` y `byExpenseCategory` incluyen los gastos de caja locales activos.
- Produce `pendingCashExpenseDelta(database: CajaDb, from: string, to: string): Promise<{ amountPesos: number; byCategory: Array<{ name: string; amountPesos: number }> }>`.
- Produce `shiftClosing(database: CajaDb, shiftId: string): Promise<ShiftClosing>`.
- Produce `exportShiftClosingCsv(closing: ShiftClosing): Blob`.
- `ShiftClosing` tiene: `shiftId`, `operationalDate`, `openedAt`, `closedAt`, `openedBy`, `closedBy`, `openingCashPesos`, `salesByMethod: Record<'CASH' | 'CARD' | 'BREB', number>`, `refundsByMethod` con la misma forma, `depositsPesos`, `withdrawalsPesos`, `cashExpensesPesos`, `cashExpensesByCategory: Array<{ name: string; amountPesos: number }>`, `expectedPesos`, `countedPesos`, `differencePesos`, `closeNote`, `countedBreakdown`, `voidedMovements: Array<{ type: string; amountPesos: number; reason: string; voidedAt: string; voidedBy: string }>`.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `local-summary.test.ts`:

```ts
it('incluye gastos de caja y excluye anulados', async () => {
  const db = await seed()
  await db.cashMovements.bulkPut([
    { id: 'm1', shiftId: 'shift-1', type: 'WITHDRAWAL', amountPesos: 5000,
      reason: 'lechuga', operationalDate: '2026-11-01', expenseCategoryName: 'Fruver' },
    { id: 'm2', shiftId: 'shift-1', type: 'WITHDRAWAL', amountPesos: 3000,
      reason: 'jabon', operationalDate: '2026-11-01', expenseCategoryName: 'Aseo',
      voidedAt: '2026-11-01T20:00:00.000Z', voidedBy: 'u1' }
  ])
  const summary = await localSummary(db, '2026-11-01', '2026-11-01')
  expect(summary.expensesPesos).toBe(5000)
  expect(summary.byExpenseCategory).toEqual([{ name: 'Fruver', amountPesos: 5000 }])
})

it('suma el gasto pendiente y no lo duplica al sincronizar', async () => {
  const db = await seed()
  await db.cashMovements.put({ id: 'm1', shiftId: 'shift-1', type: 'WITHDRAWAL',
    amountPesos: 5000, reason: 'lechuga', operationalDate: '2026-11-01',
    expenseCategoryName: 'Fruver' })
  await db.operations.put({ operationId: 'o1', seq: 1, type: 'CASH_MOVEMENT',
    entityId: 'm1', userId: 'u1', clientCreatedAt: '2026-11-01T18:00:00.000Z',
    payload: {}, status: 'LOCAL_PENDING', attempts: 0 })

  const pending = await dailySummary(db, '2026-11-01', async () => ({ expensesPesos: 0 }))
  expect(pending.expensesPesos).toBe(5000)

  await db.operations.update('o1', { status: 'SYNCED' })
  const synced = await dailySummary(db, '2026-11-01', async () => ({ expensesPesos: 5000 }))
  expect(synced.expensesPesos).toBe(5000)
})

it('resta una anulación pendiente y no resta la ya sincronizada', async () => {
  const db = await seed()
  await db.cashMovements.put({ id: 'm1', shiftId: 'shift-1', type: 'WITHDRAWAL',
    amountPesos: 5000, reason: 'lechuga', operationalDate: '2026-11-01',
    expenseCategoryName: 'Fruver', voidedAt: '2026-11-01T20:00:00.000Z', voidedBy: 'u1' })
  await db.operations.put({ operationId: 'create', seq: 1, type: 'CASH_MOVEMENT',
    entityId: 'm1', userId: 'u1', clientCreatedAt: '2026-11-01T18:00:00.000Z',
    payload: {}, status: 'SYNCED', attempts: 0 })
  await db.operations.put({ operationId: 'void', seq: 2, type: 'CASH_MOVEMENT',
    entityId: 'm1', userId: 'u1', clientCreatedAt: '2026-11-01T19:00:00.000Z',
    payload: { voided: true, replacesMovementId: 'm1' }, status: 'LOCAL_PENDING', attempts: 0 })

  const pendingVoid = await dailySummary(db, '2026-11-01', async () => ({
    expensesPesos: 5000, byExpenseCategory: [{ name: 'Fruver', amountPesos: 5000 }]
  }))
  expect(pendingVoid.expensesPesos).toBe(0)
  expect(pendingVoid.byExpenseCategory).toEqual([])

  await db.operations.update('void', { status: 'SYNCED' })
  const syncedVoid = await dailySummary(db, '2026-11-01', async () => ({ expensesPesos: 0 }))
  expect(syncedVoid.expensesPesos).toBe(0)
})

it('ajusta una corrección pendiente sin duplicar', async () => {
  const db = await seed()
  await db.cashMovements.bulkPut([
    { id: 'm1', shiftId: 'shift-1', type: 'WITHDRAWAL', amountPesos: 5000,
      reason: 'lechuga', operationalDate: '2026-11-01', expenseCategoryName: 'Fruver',
      voidedAt: '2026-11-01T20:00:00.000Z', voidedBy: 'u1' },
    { id: 'm2', shiftId: 'shift-1', type: 'WITHDRAWAL', amountPesos: 3000,
      reason: 'lechuga', operationalDate: '2026-11-01', expenseCategoryName: 'Aseo',
      replacesMovementId: 'm1' }
  ])
  await db.operations.bulkPut([
    { operationId: 'create', seq: 1, type: 'CASH_MOVEMENT', entityId: 'm1', userId: 'u1',
      clientCreatedAt: '2026-11-01T18:00:00.000Z', payload: {}, status: 'SYNCED', attempts: 0 },
    { operationId: 'correct', seq: 2, type: 'CASH_MOVEMENT', entityId: 'm2', userId: 'u1',
      clientCreatedAt: '2026-11-01T19:00:00.000Z',
      payload: { replacesMovementId: 'm1' }, status: 'LOCAL_PENDING', attempts: 0 }
  ])

  const summary = await dailySummary(db, '2026-11-01', async () => ({
    expensesPesos: 5000, byExpenseCategory: [{ name: 'Fruver', amountPesos: 5000 }]
  }))
  expect(summary.expensesPesos).toBe(3000)
  expect(summary.byExpenseCategory).toEqual([{ name: 'Aseo', amountPesos: 3000 }])
})
```

En `shift-closing.test.ts`:

```ts
async function seedClosing() {
  const db = openDb(`test-closing-${crypto.randomUUID()}`)
  await db.shifts.put({
    id: 'shift-1', userId: 'u1', openingCashPesos: 50000,
    openedAt: '2026-11-01T12:00:00.000Z', closedAt: '2026-11-01T22:00:00.000Z',
    countedCashPesos: 50000, expectedPesos: 55500, differencePesos: -5500,
    operationalDate: '2026-11-01', closeNote: 'faltante', closedBy: 'u1',
    countedBreakdown: { '20000': 2, '5000': 2 }
  })
  await db.sales.bulkPut([
    { id: 's1', displayCode: 'ALM-A-1', status: 'CHARGED', totalPesos: 16500,
      type: 'COUNTER', operationalDate: '2026-11-01', createdAt: '2026-11-01T18:00:00.000Z',
      shiftId: 'shift-1', userId: 'u1', deliveryFeePesos: 0 },
    { id: 's2', displayCode: 'ALM-A-2', status: 'CHARGED', totalPesos: 5000,
      type: 'COUNTER', operationalDate: '2026-11-01', createdAt: '2026-11-01T19:00:00.000Z',
      shiftId: 'shift-1', userId: 'u1', deliveryFeePesos: 0 }
  ])
  await db.payments.bulkPut([
    { id: 'p1', saleId: 's1', method: 'CASH', amountPesos: 16500 },
    { id: 'p2', saleId: 's2', method: 'CARD', amountPesos: 5000 }
  ])
  await db.refunds.put({
    id: 'r1', saleId: 's2', shiftId: 'shift-1', amountPesos: 5000, method: 'CASH',
    reason: 'prueba', operationalDate: '2026-11-01'
  })
  await db.cashMovements.bulkPut([
    { id: 'm1', shiftId: 'shift-1', type: 'DEPOSIT', amountPesos: 2000,
      reason: 'cambio', operationalDate: '2026-11-01' },
    { id: 'm2', shiftId: 'shift-1', type: 'WITHDRAWAL', amountPesos: 5000,
      reason: 'retiro', operationalDate: '2026-11-01' },
    { id: 'm3', shiftId: 'shift-1', type: 'WITHDRAWAL', amountPesos: 3000,
      reason: 'lechuga', operationalDate: '2026-11-01', expenseCategoryName: 'Fruver' },
    { id: 'm4', shiftId: 'shift-1', type: 'WITHDRAWAL', amountPesos: 1000,
      reason: 'error', operationalDate: '2026-11-01', expenseCategoryName: 'Aseo',
      voidedAt: '2026-11-01T20:00:00.000Z', voidedBy: 'u1' }
  ])
  return db
}

it('arma el cierre con arqueo, ventas, gastos y denominaciones', async () => {
  const db = await seedClosing()
  const closing = await shiftClosing(db, 'shift-1')

  expect(closing.salesByMethod).toEqual({ CASH: 16500, CARD: 5000, BREB: 0 })
  expect(closing.refundsByMethod).toEqual({ CASH: 5000, CARD: 0, BREB: 0 })
  expect(closing.depositsPesos).toBe(2000)
  expect(closing.withdrawalsPesos).toBe(8000)
  expect(closing.cashExpensesPesos).toBe(3000)
  expect(closing.cashExpensesByCategory).toEqual([{ name: 'Fruver', amountPesos: 3000 }])
  expect(closing.expectedPesos).toBe(55500)
  expect(closing.countedPesos).toBe(50000)
  expect(closing.differencePesos).toBe(-5500)
  expect(closing.countedBreakdown).toEqual({ '20000': 2, '5000': 2 })
})

it('incluye los movimientos anulados como sección de auditoría', async () => {
  const db = await seedClosing()
  const closing = await shiftClosing(db, 'shift-1')

  expect(closing.voidedMovements).toEqual([{
    type: 'WITHDRAWAL', amountPesos: 1000, reason: 'error',
    voidedAt: '2026-11-01T20:00:00.000Z', voidedBy: 'u1'
  }])
})

it('exporta CSV con secciones y sin perder tildes', async () => {
  const db = await seedClosing()
  const blob = exportShiftClosingCsv(await shiftClosing(db, 'shift-1'))
  const text = await new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.readAsText(blob)
  })

  expect(text).toContain('Apertura')
  expect(text).toContain('Ventas por medio')
  expect(text).toContain('Gastos de caja')
  expect(text).toContain('Arqueo')
  expect(text).toContain('Denominaciones')
  expect(text).toContain('Anulados')
  expect(text).toContain('Fruver')
  expect(text).toContain('55.500')
})
```

- [ ] **Step 2: Correr las pruebas y ver el fallo**

Run: `cd frontend && npm test -- src/application/use-cases/reports/local-summary.test.ts src/application/use-cases/reports/shift-closing.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `local-summary.ts`:
- Leer `cashMovements` del rango, activos y con `expenseCategoryName`.
- Sumarlos a `expensesPesos` y agruparlos en `byExpenseCategory`.
- Calcular `operatingProfitPesos` con esos gastos.
- Implementar `pendingCashExpenseDelta`: por cada movimiento del rango, buscar su operación de creación (`entityId = movement.id` y `payload.voided !== true`) y su operación de reemplazo (`payload.replacesMovementId === movement.id`, sea corrección o anulación).
  - Movimiento activo: si la creación no está `SYNCED`, sumar; si está `SYNCED`, el remoto ya lo incluye.
  - Movimiento anulado: restar solo si la creación está `SYNCED` y el reemplazo todavía no está `SYNCED`. Si la creación no está `SYNCED`, el remoto nunca lo contó; si el reemplazo ya está `SYNCED`, el remoto ya lo excluyó.
- En `dailySummary`, sumar el delta a `expensesPesos` y mezclar el desglose cuando hay respuesta remota, omitiendo las categorías que queden en cero. Sin respuesta remota, usar el resumen local completo.

En `shift-closing.ts`:
- Cargar turno, ventas, pagos, devoluciones y movimientos del turno.
- Calcular ventas por medio, devoluciones por medio, ingresos, retiros, gastos de caja por categoría, esperado, contado, diferencia, nota y desglose.
- Incluir la lista de movimientos anulados.
- `exportShiftClosingCsv` usa `;`, BOM y las mismas secciones descritas en el diseño.

- [ ] **Step 4: Correr las pruebas y verlas pasar**

Run: `cd frontend && npm test -- src/application/use-cases/reports/local-summary.test.ts src/application/use-cases/reports/shift-closing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/application/use-cases/reports/local-summary.ts \
  frontend/src/application/use-cases/reports/local-summary.test.ts \
  frontend/src/application/use-cases/reports/shift-closing.ts \
  frontend/src/application/use-cases/reports/shift-closing.test.ts
git commit -m "feat: resumen y cierre exportable de caja"
```

---

### Task 9: Pantalla de movimientos (frontend)

**Files:**
- Modify: `frontend/src/modules/shifts/CashScreen.tsx`
- Create: `frontend/src/modules/shifts/CashMovementPanel.tsx`
- Test: `frontend/src/modules/shifts/CashScreen.test.tsx`

**Interfaces:**
- Consumes `registerCashMovement`, `editCashMovement`, `voidCashMovement`, `expectedCash`, `availableExpenseCategories`.
- Produce labels accesibles: `Registrar ingreso`, `Registrar retiro`, `Registrar gasto de caja`, `Monto`, `Motivo`, `Categoría`, `Guardar movimiento`, `Editar`, `Anular`, `Ver anulados`, `Movimientos del turno`.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `CashScreen.test.tsx`, actualizar la siembra a un helper `seedWithShift({ closed?: boolean } = {})` que crea usuario, meta, turno y las seis categorías. Cuando `closed` es verdadero, el turno queda cerrado con diferencia −7.000, desglose y `closeNote: 'faltante revisado'`. Importar `vi` de Vitest. Agregar:

```ts
it('registra un gasto de caja y actualiza el esperado', async () => {
  const db = await seedWithShift()
  render(<CashScreen database={db} />)

  await userEvent.click(await screen.findByRole('button', { name: /registrar gasto de caja/i }))
  await userEvent.type(screen.getByLabelText(/monto/i), '5000')
  await userEvent.type(screen.getByLabelText(/motivo/i), 'compra lechuga')
  await userEvent.selectOptions(screen.getByLabelText(/categoría/i), 'Fruver')
  await userEvent.click(screen.getByRole('button', { name: /guardar movimiento/i }))

  expect(await screen.findByTestId('expected')).toHaveTextContent('45.000')
  expect(screen.getByText(/compra lechuga/i)).toBeInTheDocument()
  expect(screen.getByText(/Fruver/i)).toBeInTheDocument()
})

it('edita y anula movimientos con el turno abierto', async () => {
  const db = await seedWithShift()
  await db.cashMovements.put({
    id: 'm1', shiftId: 'shift-1', type: 'WITHDRAWAL', amountPesos: 5000,
    reason: 'compra lechuga', operationalDate: today, expenseCategoryName: 'Fruver'
  })
  render(<CashScreen database={db} />)

  await userEvent.click(await screen.findByRole('button', { name: /editar/i }))
  await userEvent.clear(screen.getByLabelText(/monto/i))
  await userEvent.type(screen.getByLabelText(/monto/i), '3000')
  await userEvent.selectOptions(screen.getByLabelText(/categoría/i), 'Aseo')
  await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))

  expect(await screen.findByTestId('expected')).toHaveTextContent('47.000')

  vi.spyOn(window, 'confirm').mockReturnValue(true)
  await userEvent.click(screen.getByRole('button', { name: /anular/i }))
  expect(await screen.findByTestId('expected')).toHaveTextContent('50.000')
})

it('oculta editar y anular después de cerrar', async () => {
  const db = await seedWithShift({ closed: true })
  await db.cashMovements.put({
    id: 'm1', shiftId: 'shift-1', type: 'WITHDRAWAL', amountPesos: 5000,
    reason: 'compra lechuga', operationalDate: today
  })
  render(<CashScreen database={db} />)

  expect(await screen.findByText(/compra lechuga/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /anular/i })).not.toBeInTheDocument()
})

it('un cajero puede usar Caja', async () => {
  const db = await seedWithShift()
  localStorage.setItem('caja.user', JSON.stringify({
    id: 'u1', username: 'ana', role: 'CASHIER', tenantId: 't', locationId: 'l'
  }))
  render(<CashScreen database={db} />)

  expect(await screen.findByRole('button', { name: /registrar retiro/i })).toBeInTheDocument()
})
```

- [ ] **Step 2: Correr las pruebas y ver el fallo**

Run: `cd frontend && npm test -- src/modules/shifts/CashScreen.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`CashScreen`:
- Cargar turno abierto, esperado, movimientos activos, movimientos anulados, historial y categorías.
- Mostrar el esperado con `data-testid="expected"`.
- Mostrar tres acciones: ingreso, retiro y gasto de caja.
- El formulario de gasto exige categoría y reutiliza `CashMovementPanel`.
- `CashMovementPanel` permite cambiar el tipo ingreso/retiro y, para retiros, marcar `Es gasto` y elegir categoría; al editar, precarga esos valores.
- La lista muestra tipo, monto, motivo, categoría y usuario; cada fila activa tiene `Editar` y `Anular`.
- Editar abre el formulario con los valores actuales; guardar llama a `editCashMovement`.
- Anular pide confirmación y llama a `voidCashMovement`.
- `Ver anulados` muestra la sección de anulados.
- No mostrar acciones si el turno está cerrado.
- Eliminar el botón `Exportar CSV` del resumen diario; ese export ya vive en Reportes.

`CashMovementPanel` recibe el turno, el movimiento opcional, las categorías y los callbacks `onSave`/`onCancel`.

- [ ] **Step 4: Correr pruebas y build**

Run: `cd frontend && npm test -- src/modules/shifts/CashScreen.test.tsx && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/shifts/CashScreen.tsx \
  frontend/src/modules/shifts/CashMovementPanel.tsx \
  frontend/src/modules/shifts/CashScreen.test.tsx
git commit -m "feat: movimientos de caja en la pantalla"
```

---

### Task 10: Cierre, historial y exportación (frontend)

**Files:**
- Modify: `frontend/src/modules/shifts/CashScreen.tsx`
- Create: `frontend/src/modules/shifts/ShiftClosePanel.tsx`
- Create: `frontend/src/modules/shifts/ShiftHistory.tsx`
- Test: `frontend/src/modules/shifts/CashScreen.test.tsx`

**Interfaces:**
- Consumes `DENOMINATIONS`, `denominationTotal`, `closeShift`, `shiftClosing`, `exportShiftClosingCsv`.
- Produce labels: `Cantidad de 100.000`, …, `Cantidad de 50`, `Total contado`, `Nota del cierre`, `Cerrar turno`, `Descargar cierre`, `Turnos anteriores`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Reemplazar la prueba existente que escribe `efectivo contado` por la de denominaciones; ese campo desaparece. Agregar:

```ts
it('cierra con denominaciones y exige nota si hay diferencia', async () => {
  const db = await seedWithShift()
  render(<CashScreen database={db} />)

  await userEvent.type(await screen.findByLabelText(/cantidad de 20\.000/i), '2')
  await userEvent.type(screen.getByLabelText(/cantidad de 1\.000/i), '3')
  expect(screen.getByTestId('counted')).toHaveTextContent('43.000')
  await userEvent.click(screen.getByRole('button', { name: /cerrar turno/i }))
  expect(await screen.findByText(/nota es obligatoria/i)).toBeInTheDocument()

  await userEvent.type(screen.getByLabelText(/nota del cierre/i), 'faltante revisado')
  await userEvent.click(screen.getByRole('button', { name: /cerrar turno/i }))
  expect(await screen.findByTestId('difference')).toHaveTextContent('-7.000')
})

it('muestra el turno cerrado en el historial y permite descargar', async () => {
  const db = await seedWithShift({ closed: true })
  render(<CashScreen database={db} />)

  expect(await screen.findByText(/turnos anteriores/i)).toBeInTheDocument()
  expect(screen.getByText(/faltante revisado/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /descargar cierre/i })).toBeInTheDocument()
})
```

- [ ] **Step 2: Correr las pruebas y ver el fallo**

Run: `cd frontend && npm test -- src/modules/shifts/CashScreen.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`ShiftClosePanel`:
- Una fila por denominación con etiqueta `Cantidad de <denominación>` formateada en `es-CO`.
- Total contado calculado con `denominationTotal` y `data-testid="counted"`.
- Diferencia con `data-testid="difference"`.
- Nota obligatoria si la diferencia no es cero; si falta, mostrar `La nota es obligatoria cuando hay diferencia.` y no cerrar.
- Al cerrar, mostrar el resultado y el botón `Descargar cierre`.

`ShiftHistory`:
- Lista los turnos locales más recientes primero con fecha, apertura, esperado, contado, diferencia y nota.
- Botón `Descargar cierre` por turno cerrado.

La descarga usa `URL.createObjectURL` y un `<a download>` como los exports actuales. El nombre del archivo es `cierre-<fecha>-<shiftId>.csv`.

- [ ] **Step 4: Correr pruebas y build**

Run: `cd frontend && npm test -- src/modules/shifts/CashScreen.test.tsx && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/shifts/CashScreen.tsx \
  frontend/src/modules/shifts/ShiftClosePanel.tsx \
  frontend/src/modules/shifts/ShiftHistory.tsx \
  frontend/src/modules/shifts/CashScreen.test.tsx
git commit -m "feat: cierre por denominaciones e historial de turnos"
```

---

### Task 11: E2E, documentación y verificación completa

**Files:**
- Modify: `frontend/e2e/helpers.ts`
- Modify: `frontend/e2e/offline.spec.ts`
- Create: `frontend/e2e/cash-operations.spec.ts`
- Modify: `docs/manual-operacion.md`
- Modify: `docs/endpoints.md`
- Modify: `docs/estado.md`

**Interfaces:**
- Consumes todas las tareas anteriores.

- [ ] **Step 1: Actualizar el helper de cierre**

`closeShift(page, breakdown: Record<number, number>, note?: string)` llena `Cantidad de <denominación>` y, si viene, `Nota del cierre`. Actualizar `offline.spec.ts` a `closeShift(page, { 20000: 3, 5000: 1 }, 'faltante')`.

- [ ] **Step 2: Agregar el escenario E2E de caja**

En `cash-operations.spec.ts`:

1. Login admin, registrar dispositivo y abrir turno con $50.000.
2. Ir a Caja, registrar gasto de caja de $5.000 en Fruver.
3. Verificar esperado $45.000.
4. Editar el gasto a $3.000 en Aseo; verificar esperado $47.000.
5. Cerrar con 2 billetes de $20.000 y 7 monedas de $1.000; descargar el CSV.
6. Verificar que el CSV contiene `Aseo`, `47.000` y la sección de denominaciones.

- [ ] **Step 3: Correr la suite completa**

Run:
```bash
cd backend && ./mvnw verify
cd frontend && npm test && npm run build
```

Expected: todas las pruebas verdes.

Run (con backend e2e levantado según `docs/e2e.md`):
```bash
cd frontend && npx playwright test e2e/cash-operations.spec.ts e2e/offline.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Actualizar documentación**

En `docs/manual-operacion.md`:
- Movimientos de caja: ingresos, retiros, gastos y edición/anulación solo con turno abierto.
- Cierre: contar denominaciones, nota obligatoria si hay diferencia, descargar cierre.
- Roles: cualquier usuario autenticado opera Caja; Reportes y gastos por fuera siguen siendo Encargado/Admin.
- Quitar la referencia a escribir el efectivo contado a mano.

En `docs/endpoints.md`:
- Ejemplo de `CASH_MOVEMENT` con `expenseCategoryName`.
- Ejemplo de corrección con `replacesMovementId` y `voided`.
- Ejemplo de `CLOSE_SHIFT` con `countedBreakdown` y `closeNote`.
- Indicar que `GET /api/expenses/categories` está disponible para cualquier usuario autenticado.
- Indicar que los gastos anulados no aparecen en listados ni reportes.

En `docs/estado.md`: agregar la iteración con tareas, verificación y notas, incluida la decisión de roles y el límite de edición al turno abierto.

- [ ] **Step 5: Commit**

```bash
git add frontend/e2e/helpers.ts frontend/e2e/offline.spec.ts \
  frontend/e2e/cash-operations.spec.ts docs/manual-operacion.md docs/endpoints.md docs/estado.md
git commit -m "docs: operacion de caja y verificacion e2e"
```

---

## Self-Review

- **Cobertura del spec:** D-19 → Tareas 2, 6 y 9; D-20 → Tareas 2, 3, 6 y 9; D-21 → Tareas 1, 4, 7 y 10; D-22 → Tareas 4, 7 y 10; D-23 → Tareas 4, 8, 10 y 11; D-24 → Tarea 5; D-25 → límite explícito, sin tareas de consolidación; D-26 → Tareas 1, 5 y 9; D-27 → Tareas 3, 6 y 9.
- **Consistencia de tipos:** `CASH_MOVEMENT` usa `movementType`, `amountPesos`, `reason`, `expenseCategoryName`, `replacesMovementId` y `voided` en ambos lados. `CLOSE_SHIFT` usa `countedBreakdown` y `closeNote` en ambos lados. `voidedAt` es local y `voided_at` es backend; la correspondencia se mantiene en el plan.
- **Compatibilidad:** los payloads viejos de `CASH_MOVEMENT` sin gasto ni corrección y de `CLOSE_SHIFT` sin desglose ni nota siguen aceptándose. La corrección sin movimiento original no falla.
- **Riesgo conocido:** el historial de turnos es local del dispositivo. Ver turnos de otras cajas o sedes requiere un endpoint central y queda fuera del alcance aprobado.
- **Datos existentes:** las columnas nuevas son nulas; no se reescriben ventas, gastos, movimientos ni cierres históricos.
