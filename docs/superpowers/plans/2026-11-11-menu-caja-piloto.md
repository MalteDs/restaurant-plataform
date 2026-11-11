# Menú editable y caja de turno real — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Almendros administre su menú desde la app y cierre la caja de un turno real con vuelto, resumen y confirmación, sin tocar la API ni el código.

**Architecture:** Se agrega un snapshot administrativo del catálogo (incluye inactivos) y se completa el CRUD de menú en el frontend reutilizando los endpoints existentes de catálogo. En caja se agregan dos cálculos locales: vuelto en el cobro y resumen del turno antes del cierre. El catálogo local se refresca al guardar para que la venta use el precio nuevo.

**Tech Stack:** React 18 + Vite + TypeScript + Tailwind + Dexie; Spring Boot + JdbcTemplate + PostgreSQL; Vitest + Testing Library; JUnit + MockMvc + Testcontainers; Playwright.

**Spec:** `docs/superpowers/specs/2026-11-11-menu-caja-piloto-design.md`

## Global Constraints

- Dinero en pesos enteros (`bigint`), sin decimales; formato visible `es-CO`.
- Zona horaria de fechas operativas: `America/Bogota`.
- Sin dependencias nuevas de frontend ni backend.
- Menú y catálogo administrativo requieren conexión y rol `ADMIN`; Caja sigue funcionando sin conexión y con cualquier usuario autenticado.
- El snapshot de sync (`GET /api/catalog`) sigue devolviendo solo activos. El snapshot administrativo (`GET /api/catalog/admin`) es el único que incluye inactivos.
- Copy de interfaz en español, consistente con las pantallas existentes.
- Comandos de verificación: `cd backend && ./mvnw verify`, `cd frontend && npm test`, `cd frontend && npm run build`.
- Cada tarea termina con su prueba en verde y un commit.

## Review Focus

- Un `CASHIER` intenta leer `/api/catalog/admin` y recibe 403 (Task 1).
- Un producto inactivo no aparece en el snapshot que usa la venta, pero sí en el administrativo y se puede reactivar (Tasks 1 y 3).
- Un producto se crea o edita con un `modifierGroupId` inexistente o de otra sede y el servidor responde 400 (Task 2).
- El cajero escribe un efectivo recibido menor al total y el cobro se bloquea con mensaje, sin crear la venta (Task 6).
- El cajero cancela la confirmación de cierre y el turno sigue abierto (Task 7).
- Un fallo de `syncCatalog` después de guardar el producto no revierte el guardado, pero avisa que la caja local se actualizará después (Task 3).

---

### Task 1: Snapshot administrativo con inactivos

**Files:**
- Modify: `backend/src/main/java/com/caja/catalog/CatalogSnapshot.java`
- Modify: `backend/src/main/java/com/caja/catalog/CatalogService.java`
- Modify: `backend/src/main/java/com/caja/catalog/CatalogController.java`
- Create: `backend/src/test/java/com/caja/catalog/CatalogAdminIT.java`

**Interfaces:**
- Produces: `CatalogSnapshot.ModifierGroupView(UUID id, String name, int minSelection, int maxSelection, boolean active, List<ModifierView> modifiers)`
- Produces: `CatalogService.snapshot(TenantId tenantId, UUID locationId, boolean includeInactive)`
- Produces: `GET /api/catalog/admin` → `CatalogSnapshot` con categorías, productos y grupos inactivos, solo `ADMIN`.
- Consumes: `CatalogService` queries existentes de `categories`, `products`, `modifier_groups`, `modifiers`.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `CatalogAdminIT`, con su propio contenedor y seed (copiar el patrón de `CatalogIT`), agregar:

```java
@Test void adminSnapshotIncludesInactiveProductsAndCategories() throws Exception {
  var productId = createProduct("PRODUCTO INACTIVO", 10000);
  deactivateProduct(productId);
  var categoryId = createCategory("CATEGORIA INACTIVA");
  deactivateCategory(categoryId);

  assertTrue(adminProductNames().contains("PRODUCTO INACTIVO"));
  assertFalse(publicProductNames().contains("PRODUCTO INACTIVO"));
  assertTrue(adminCategoryNames().contains("CATEGORIA INACTIVA"));
  assertFalse(publicCategoryNames().contains("CATEGORIA INACTIVA"));
}

@Test void cashierCannotReadAdminSnapshot() throws Exception {
  mvc.perform(get("/api/catalog/admin")
          .header("Authorization", "Bearer " + tokenFor("cajero_admin_catalogo", "CASHIER")))
      .andExpect(status().isForbidden());
}

@Test void adminSnapshotIncludesInactiveModifierGroups() throws Exception {
  var groupId = createModifierGroup("GRUPO INACTIVO");
  deactivateModifierGroup(groupId);

  assertTrue(adminGroupNames().contains("GRUPO INACTIVO"));
  assertFalse(publicGroupNames().contains("GRUPO INACTIVO"));
}
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `cd backend && ./mvnw test -Dtest=CatalogAdminIT`
Expected: FAIL con 404 en `/api/catalog/admin` o `assertFalse` sobre el snapshot público.

- [ ] **Step 3: Implementar**

En `CatalogSnapshot`, cambiar `ModifierGroupView` a:

```java
public record ModifierGroupView(UUID id, String name, int minSelection, int maxSelection,
                                boolean active, List<ModifierView> modifiers) {
}
```

En `CatalogService`, cambiar la firma a `snapshot(TenantId tenantId, UUID locationId, boolean includeInactive)`. En las consultas de `categories`, `products` y `modifier_groups`, agregar la condición `and (? or active)` y pasar `includeInactive` como argumento. Seleccionar `active` en `modifier_groups` y pasarlo al constructor. `findAll` llama `snapshot(tenantId, locationId, false)`.

En `CatalogController`:

```java
@GetMapping
public CatalogSnapshot snapshot(@AuthenticationPrincipal AuthenticatedUser user) {
  return catalog.snapshot(new TenantId(user.tenantId()), user.locationId(), false);
}

@GetMapping("/admin")
@PreAuthorize("hasRole('ADMIN')")
public CatalogSnapshot adminSnapshot(@AuthenticationPrincipal AuthenticatedUser user) {
  return catalog.snapshot(new TenantId(user.tenantId()), user.locationId(), true);
}
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `cd backend && ./mvnw test -Dtest=CatalogAdminIT,CatalogIT`
Expected: PASS en ambas clases.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/caja/catalog backend/src/test/java/com/caja/catalog/CatalogAdminIT.java
git commit -m "feat: expose admin catalog snapshot with inactive items"
```

---

### Task 2: Asignar grupos de modificadores a productos

**Files:**
- Modify: `backend/src/main/java/com/caja/catalog/CatalogController.java`
- Modify: `backend/src/main/java/com/caja/catalog/CatalogService.java`
- Test: `backend/src/test/java/com/caja/catalog/CatalogAdminIT.java`

**Interfaces:**
- Consumes: `GET /api/catalog/admin` de Task 1.
- Produces: `POST /api/catalog/products` y `PUT /api/catalog/products/{id}` aceptan `modifierGroupIds: UUID[]`.
- Produces: `CatalogService.createProduct(..., List<UUID> modifierGroupIds)` y `CatalogService.updateProduct(..., List<UUID> modifierGroupIds)`.
- Regla: `modifierGroupIds == null` no cambia nada; lista vacía quita todos; un id inexistente o de otra sede responde 400.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `CatalogAdminIT`:

```java
@Test void assignsAndClearsModifierGroupsOnProduct() throws Exception {
  var groupId = createModifierGroup("GRUPO ASIGNABLE");
  var productId = createProductWithGroups("PRODUCTO CON GRUPO", List.of(groupId));

  assertEquals(List.of(groupId), adminProductGroupIds(productId));

  updateProductGroups(productId, List.of());
  assertEquals(List.of(), adminProductGroupIds(productId));
}

@Test void rejectsUnknownModifierGroupOnProduct() throws Exception {
  mvc.perform(post("/api/catalog/products").contentType(MediaType.APPLICATION_JSON)
          .header("Authorization", "Bearer " + adminToken("admin_grupo_malo"))
          .content(json.writeValueAsString(Map.of(
              "name", "PRODUCTO GRUPO MALO",
              "pricePesos", 10000,
              "modifierGroupIds", List.of(UUID.randomUUID())))))
      .andExpect(status().isBadRequest());
}
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `cd backend && ./mvnw test -Dtest=CatalogAdminIT`
Expected: FAIL porque `modifierGroupIds` no se envía ni se guarda.

- [ ] **Step 3: Implementar**

Agregar `List<@NotNull UUID> modifierGroupIds` a `ProductRequest` y `ProductUpdate` en `CatalogController` y pasarlo a `CatalogService`. El `@NotNull` evita un 500 si llega un id nulo.

En `CatalogService`, agregar:

```java
private void replaceModifierGroups(TenantId tenantId, UUID locationId, UUID productId,
                                   List<UUID> groupIds) {
  jdbc.update("""
      delete from product_modifier_groups
      where product_id = ? and tenant_id = ? and location_id = ?
      """, productId, tenantId.value(), locationId);
  for (var groupId : groupIds) {
    var exists = jdbc.queryForObject("""
        select count(*) from modifier_groups
        where id = ? and tenant_id = ? and location_id = ?
        """, Integer.class, groupId, tenantId.value(), locationId);
    if (exists == null || exists == 0) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
          "Grupo de modificadores invalido");
    }
    jdbc.update("""
        insert into product_modifier_groups(product_id, modifier_group_id, tenant_id, location_id)
        values (?, ?, ?, ?)
        """, productId, groupId, tenantId.value(), locationId);
  }
}
```

Llamarlo en `createProduct` cuando `modifierGroupIds != null && !modifierGroupIds.isEmpty()`, y en `updateProduct` cuando `modifierGroupIds != null`. Mantener el `coalesce` actual para los demás campos.

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `cd backend && ./mvnw test -Dtest=CatalogAdminIT`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/caja/catalog backend/src/test/java/com/caja/catalog/CatalogAdminIT.java
git commit -m "feat: assign modifier groups to catalog products"
```

---

### Task 3: Gestión de productos en Administración

**Files:**
- Create: `frontend/src/modules/admin/catalog-admin.ts`
- Create: `frontend/src/modules/admin/ProductForm.tsx`
- Modify: `frontend/src/modules/admin/CatalogScreen.tsx`
- Test: `frontend/src/modules/admin/CatalogScreen.test.tsx`

**Interfaces:**
- Produces: `AdminSnapshot`, `AdminProduct`, `AdminCategory`, `AdminModifierGroup`, `ProductInput` en `catalog-admin.ts`.
- Produces: `CatalogScreen({ database = db }: { database?: CajaDb })`.
- Produces: `ProductForm({ product, categories, modifierGroups, onSave, onCancel })`.
- Consumes: `GET /api/catalog/admin`, `POST /api/catalog/products`, `PUT /api/catalog/products/{id}`, `syncCatalog(database)`.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `CatalogScreen.test.tsx`, con `fake-indexeddb/auto`, `request` mockeado y `syncCatalog` mockeado. Definir helpers locales: `product(overrides)` devuelve un producto completo con valores por defecto; `mockAdminSnapshot({ products, categories, modifierGroups })` hace que `request('/api/catalog/admin')` resuelva ese snapshot.

```tsx
it('lista activos e inactivos y busca por nombre', async () => {
  mockAdminSnapshot({
    products: [
      product({ id: 'p1', name: 'SENCILLA', active: true }),
      product({ id: 'p2', name: 'PRODUCTO VIEJO', active: false })
    ],
    categories: [category({ id: 'c1', name: 'HAMBURGUESAS' })],
    modifierGroups: []
  });
  render(<CatalogScreen database={db} />);

  expect(await screen.findByText('PRODUCTO VIEJO')).toBeInTheDocument();
  expect(screen.getByText('Inactivo')).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText(/buscar producto/i), 'sencilla');
  expect(screen.queryByText('PRODUCTO VIEJO')).not.toBeInTheDocument();
});

it('crea un producto, refresca y sincroniza el catálogo local', async () => {
  mockAdminSnapshot({
    products: [],
    categories: [category({ id: 'c1', name: 'HAMBURGUESAS' })],
    modifierGroups: []
  });
  render(<CatalogScreen database={db} />);

  await userEvent.click(await screen.findByRole('button', { name: /nuevo producto/i }));
  await userEvent.type(screen.getByLabelText(/^nombre$/i), 'PRODUCTO NUEVO');
  await userEvent.selectOptions(screen.getByLabelText(/^categoría$/i), 'c1');
  await userEvent.type(screen.getByLabelText(/^precio$/i), '12300');
  await userEvent.click(screen.getByRole('button', { name: /guardar producto/i }));

  await waitFor(() => expect(request).toHaveBeenCalledWith('/api/catalog/products', expect.objectContaining({
    method: 'POST',
    body: expect.stringContaining('"name":"PRODUCTO NUEVO"')
  })));
  await waitFor(() => expect(syncCatalog).toHaveBeenCalledWith(db));
});

it('edita nombre, precio y costo de un producto', async () => {
  mockAdminSnapshot({
    products: [product({ id: 'p1', name: 'SENCILLA', pricePesos: 16500 })],
    categories: [category({ id: 'c1', name: 'HAMBURGUESAS' })],
    modifierGroups: []
  });
  render(<CatalogScreen database={db} />);

  await userEvent.click(await screen.findByRole('button', { name: /editar/i }));
  await userEvent.clear(screen.getByLabelText(/^nombre$/i));
  await userEvent.type(screen.getByLabelText(/^nombre$/i), 'SENCILLA ESPECIAL');
  await userEvent.clear(screen.getByLabelText(/^precio$/i));
  await userEvent.type(screen.getByLabelText(/^precio$/i), '18000');
  await userEvent.type(screen.getByLabelText(/costo/i), '6000');
  await userEvent.click(screen.getByRole('button', { name: /guardar producto/i }));

  await waitFor(() => expect(request).toHaveBeenCalledWith('/api/catalog/products/p1',
    expect.objectContaining({ method: 'PUT' })));
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `cd frontend && npm test -- src/modules/admin/CatalogScreen.test.tsx`
Expected: FAIL porque la pantalla actual no tiene formulario ni busca.

- [ ] **Step 3: Implementar**

`catalog-admin.ts` define las interfaces del snapshot administrativo y `ProductInput`.

`CatalogScreen`:
- Carga `request<AdminSnapshot>('/api/catalog/admin')`.
- `useDeferredValue` para la búsqueda; filtro por nombre normalizado (sin tildes/mayúsculas) y por categoría. Etiquetas: "Buscar producto" y "Filtrar por categoría" (para no chocar con el select "Categoría" del formulario).
- Tabla dentro de `overflow-x-auto`; columnas Producto, Categoría, Precio, Costo, Días, Estado y Acciones. Badge "Inactivo" y botón "Editar".
- Botón "Nuevo producto" que abre `ProductForm` en un panel lateral (`grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]`).
- Estado vacío: "Sin productos con esos filtros." y botón "Limpiar filtros".
- `onSave` hace POST o PUT. Si el guardado responde bien, muestra `role="status"` con "Producto guardado"; después llama `refreshAll()`, que hace `refresh()` y `syncCatalog(database)`. Si falla el refresh o el sync, no cambia el mensaje de éxito: muestra el aviso "Producto guardado. La caja local se actualizará en la próxima sincronización." Solo un fallo del POST/PUT muestra error con `role="alert"`.
- `refreshAll` se pasa como `onChanged` a los paneles de categorías y modificadores, para que cualquier cambio de menú refresque también el catálogo local.
- Al guardar un producto, cerrar el panel (`setEditing(null)`); al cancelar, cerrarlo sin llamar al servidor.
- Errores de validación del formulario con `role="alert"`.

`ProductForm`:
- Campos: Nombre, Categoría (select con categorías activas e inactivas etiquetadas), Precio, Costo (opcional), Días de venta, Activo (solo edición), checkboxes de grupos de modificadores.
- Para un `COMBO` existente, mostrar "Combo · la composición se administra por seed" y no permitir cambiar el tipo.
- Validar nombre no vacío, precio entero ≥ 0, costo entero ≥ 0. Si el costo está vacío, enviar `0` (el endpoint actual no permite volver a `null`). Usar `parseSaleDaysInput` y `formatSaleDays`.
- No agregar dependencias.

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `cd frontend && npm test -- src/modules/admin/CatalogScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/admin frontend/src/modules/sales/sale-days.ts
git commit -m "feat: manage catalog products from admin"
```

---

### Task 4: Gestión de categorías

**Files:**
- Create: `frontend/src/modules/admin/CategoryPanel.tsx`
- Modify: `frontend/src/modules/admin/CatalogScreen.tsx`
- Test: `frontend/src/modules/admin/CategoryPanel.test.tsx`

**Interfaces:**
- Produces: `CategoryPanel({ categories, onChanged }: { categories: AdminCategory[]; onChanged: () => Promise<void> })`.
- Consumes: `POST /api/catalog/categories`, `PUT /api/catalog/categories/{id}`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```tsx
it('crea una categoría con nombre y orden', async () => {
  render(<CategoryPanel categories={[]} onChanged={vi.fn()} />);
  await userEvent.type(screen.getByLabelText(/nueva categoría/i), 'POSTRES');
  await userEvent.type(screen.getByLabelText(/orden/i), '3');
  await userEvent.click(screen.getByRole('button', { name: /agregar categoría/i }));

  await waitFor(() => expect(request).toHaveBeenCalledWith('/api/catalog/categories',
    expect.objectContaining({ method: 'POST' })));
  expect(JSON.parse(String(vi.mocked(request).mock.calls[0][1]?.body))).toMatchObject({
    name: 'POSTRES', sortOrder: 3
  });
});

it('edita nombre, orden y activo de una categoría', async () => {
  render(<CategoryPanel categories={[{ id: 'c1', name: 'BEBIDAS', sortOrder: 1, active: true }]}
    onChanged={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: /editar/i }));
  await userEvent.clear(screen.getByLabelText(/^nombre$/i));
  await userEvent.type(screen.getByLabelText(/^nombre$/i), 'BEBIDAS FRÍAS');
  await userEvent.click(screen.getByRole('button', { name: /guardar categoría/i }));

  await waitFor(() => expect(request).toHaveBeenCalledWith('/api/catalog/categories/c1',
    expect.objectContaining({ method: 'PUT' })));
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `cd frontend && npm test -- src/modules/admin/CategoryPanel.test.tsx`
Expected: FAIL porque el componente no existe.

- [ ] **Step 3: Implementar**

`CategoryPanel` muestra una tarjeta con formulario de alta etiquetado "Nueva categoría" y "Orden", y una lista de categorías con badge activo/inactivo. "Editar" abre el mismo formulario en modo edición con "Nombre", "Orden" y checkbox Activo. Validar nombre no vacío y orden entero ≥ 0. Al guardar, POST o PUT y luego `await onChanged()`. Éxito `role="status"`, error `role="alert"`. En `CatalogScreen`, renderizar `<CategoryPanel categories={snapshot.categories} onChanged={refreshAll} />` debajo de la tabla.

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `cd frontend && npm test -- src/modules/admin/CategoryPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/admin/CategoryPanel.tsx frontend/src/modules/admin/CategoryPanel.test.tsx frontend/src/modules/admin/CatalogScreen.tsx
git commit -m "feat: manage catalog categories from admin"
```

---

### Task 5: Gestión de grupos de modificadores

**Files:**
- Create: `frontend/src/modules/admin/ModifierGroupPanel.tsx`
- Modify: `frontend/src/modules/admin/CatalogScreen.tsx`
- Modify: `frontend/src/infrastructure/database/schema.ts`
- Modify: `frontend/src/application/use-cases/catalog/sync-catalog.ts`
- Test: `frontend/src/modules/admin/ModifierGroupPanel.test.tsx`

**Interfaces:**
- Produces: `ModifierGroupPanel({ groups, onChanged }: { groups: AdminModifierGroup[]; onChanged: () => Promise<void> })`.
- Consumes: `POST /api/catalog/modifier-groups`, `PUT /api/catalog/modifier-groups/{id}`.
- `ModifierGroupRow` y `CatalogSnapshotPayload.modifierGroups` aceptan `active?: boolean`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```tsx
it('crea un grupo con opciones y precios adicionales', async () => {
  render(<ModifierGroupPanel groups={[]} onChanged={vi.fn()} />);
  await userEvent.type(screen.getByLabelText(/nombre del grupo/i), 'EXTRAS');
  await userEvent.type(screen.getByLabelText(/opción 1/i), 'Queso');
  await userEvent.type(screen.getByLabelText(/precio adicional 1/i), '2000');
  await userEvent.click(screen.getByRole('button', { name: /crear grupo/i }));

  await waitFor(() => expect(request).toHaveBeenCalledWith('/api/catalog/modifier-groups',
    expect.objectContaining({ method: 'POST' })));
  const body = JSON.parse(String(vi.mocked(request).mock.calls[0][1]?.body));
  expect(body).toMatchObject({
    name: 'EXTRAS', minSelection: 0, maxSelection: 1,
    modifiers: [{ name: 'Queso', additionalPricePesos: 2000 }]
  });
});

it('edita el nombre y el activo de un grupo', async () => {
  render(<ModifierGroupPanel
    groups={[{ id: 'g1', name: 'EXTRAS', minSelection: 0, maxSelection: 1, active: true,
      modifiers: [{ id: 'm1', name: 'Queso', additionalPricePesos: 2000 }] }]}
    onChanged={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: /editar/i }));
  await userEvent.type(screen.getByLabelText(/nombre del grupo/i), ' ADICIONALES');
  await userEvent.click(screen.getByRole('button', { name: /guardar grupo/i }));

  await waitFor(() => expect(request).toHaveBeenCalledWith('/api/catalog/modifier-groups/g1',
    expect.objectContaining({ method: 'PUT' })));
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `cd frontend && npm test -- src/modules/admin/ModifierGroupPanel.test.tsx`
Expected: FAIL porque el componente no existe.

- [ ] **Step 3: Implementar**

`ModifierGroupPanel`:
- Alta: "Nombre del grupo", "Mínimo" (default 0), "Máximo" (default 1) y filas de opciones con etiquetas accesibles `Opción 1`, `Precio adicional 1`, etc., más "Agregar opción" y quitar por fila. Al menos una opción.
- POST `/api/catalog/modifier-groups` con `{ name, minSelection, maxSelection, modifiers }`.
- Lista: nombre, min/max, cantidad de opciones, badge activo/inactivo y "Editar".
- Edición: solo Nombre y Activo (el backend no permite cambiar opciones); mostrar la nota "Las opciones se definen al crear el grupo."
- Validar mínimo ≥ 0, máximo ≥ mínimo, nombres no vacíos, precios enteros ≥ 0.
- En `CatalogScreen`, renderizar `<ModifierGroupPanel groups={snapshot.modifierGroups} onChanged={refreshAll} />`.

Agregar `active?: boolean` a `ModifierGroupRow` y al payload de `syncCatalog`; no cambiar las consultas ni la lógica de venta.

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `cd frontend && npm test -- src/modules/admin/ModifierGroupPanel.test.tsx src/application/use-cases/catalog/sync-catalog.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/admin/ModifierGroupPanel.tsx frontend/src/modules/admin/ModifierGroupPanel.test.tsx frontend/src/modules/admin/CatalogScreen.tsx frontend/src/infrastructure/database/schema.ts frontend/src/application/use-cases/catalog/sync-catalog.ts
git commit -m "feat: manage modifier groups from admin"
```

---

### Task 6: Vuelto en el cobro de efectivo

**Files:**
- Modify: `frontend/src/modules/sales/SaleScreen.tsx`
- Test: `frontend/src/modules/sales/SaleScreen.test.tsx`

**Interfaces:**
- Consumes: `total` y `method` existentes.
- Produces: estado `cashReceived`, cálculo `change = Number(cashReceived) - total`.
- Regla: si `method === 'CASH'`, no hay split y `cashReceived` no está vacío e es menor a `total`, `onCharge` no crea la venta y muestra "El efectivo recibido no alcanza el total".

- [ ] **Step 1: Escribir las pruebas que fallan**

Extraer un helper local `seedProduct({ pricePesos })` que abre una base de prueba y guarda un producto `SENCILLA` con ese precio, siguiendo el patrón de las pruebas existentes.

```tsx
it('muestra el vuelto de un pago en efectivo', async () => {
  const db = await seedProduct({ pricePesos: 16500 });
  const create = vi.fn().mockResolvedValue({
    saleId: 's1', displayCode: 'ALM-A-000001', totalPesos: 16500
  });
  renderScreen({ database: db, onCreateSale: create });

  await userEvent.click(await screen.findByRole('button', { name: /sencilla/i }));
  await userEvent.type(screen.getByLabelText(/efectivo recibido/i), '20000');

  expect(screen.getByText(/vuelto \$3\.500/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /cobrar/i }));

  expect(create).toHaveBeenCalledTimes(1);
  expect(create.mock.calls[0][0].payments).toEqual([{ method: 'CASH', amountPesos: 16500 }]);
});

it('no cobra si el efectivo recibido no alcanza', async () => {
  const db = await seedProduct({ pricePesos: 16500 });
  const create = vi.fn();
  renderScreen({ database: db, onCreateSale: create });

  await userEvent.click(await screen.findByRole('button', { name: /sencilla/i }));
  await userEvent.type(screen.getByLabelText(/efectivo recibido/i), '10000');
  expect(screen.getByText(/faltan \$6\.500/i)).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /cobrar/i }));
  expect(create).not.toHaveBeenCalled();
  expect(screen.getByText(/efectivo recibido no alcanza/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `cd frontend && npm test -- src/modules/sales/SaleScreen.test.tsx`
Expected: FAIL porque no existe el campo "Efectivo recibido".

- [ ] **Step 3: Implementar**

En `SaleScreen`, agregar `const [cashReceived, setCashReceived] = useState('')`. Bajo el select "Pago", cuando `!splitMode && method === 'CASH'`:

```tsx
<label className="block text-sm font-medium text-gray-700">
  Efectivo recibido (opcional)
  <Input className="mt-1" type="number" inputMode="numeric" min={0}
    value={cashReceived}
    onChange={(event) => setCashReceived(event.target.value)} />
</label>
{cashReceived.trim() !== '' ? (
  <p aria-live="polite" className={received >= total ? 'text-sm text-green-700' : 'text-sm text-amber-700'}>
    {received >= total
      ? `Vuelto $${(received - total).toLocaleString('es-CO')}`
      : `Faltan $${(total - received).toLocaleString('es-CO')}`}
  </p>
) : null}
```

En `onCharge`, antes de construir `payments`:

```ts
const received = Number(cashReceived)
if (!splitMode && method === 'CASH' && cashReceived.trim() !== '' && received < total) {
  setError('El efectivo recibido no alcanza el total')
  return
}
```

Al terminar una venta exitosa, `setCashReceived('')`.

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `cd frontend && npm test -- src/modules/sales/SaleScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/sales/SaleScreen.tsx frontend/src/modules/sales/SaleScreen.test.tsx
git commit -m "feat: show cash change during checkout"
```

---

### Task 7: Resumen del turno y confirmación de cierre

**Files:**
- Modify: `frontend/src/modules/shifts/CashScreen.tsx`
- Modify: `frontend/src/modules/shifts/ShiftClosePanel.tsx`
- Test: `frontend/src/modules/shifts/CashScreen.test.tsx`

**Interfaces:**
- Consumes: `shiftClosing(database, shiftId)` de `application/use-cases/reports/shift-closing`.
- Produces: `ShiftClosePanel({ database, expectedPesos, summary, onClosed })`, con `summary: ShiftClosing | null`.
- Regla: cerrar siempre pide `window.confirm`; si se cancela, el turno sigue abierto.

- [ ] **Step 1: Escribir las pruebas que fallan**

```tsx
it('muestra el resumen del turno antes de cerrar', async () => {
  const db = await seedWithShift()
  await db.sales.put({ id: 's1', displayCode: 'ALM-A-1', status: 'CHARGED', totalPesos: 16500,
    type: 'COUNTER', method: 'CASH', operationalDate: today, createdAt: new Date().toISOString(),
    shiftId: 'shift-1', userId: 'u1', deliveryFeePesos: 0 })
  await db.payments.put({ id: 'p1', saleId: 's1', method: 'CASH', amountPesos: 16500 })
  await db.cashMovements.put({ id: 'm1', shiftId: 'shift-1', type: 'WITHDRAWAL',
    amountPesos: 5000, reason: 'compra lechuga', operationalDate: today,
    expenseCategoryName: 'Fruver' })

  render(<CashScreen database={db} />)

  const summary = await screen.findByTestId('shift-summary', {}, { timeout: 5000 })
  expect(summary).toHaveTextContent(/ventas efectivo/i)
  expect(summary).toHaveTextContent(/16\.500/)
  expect(summary).toHaveTextContent(/gastos de caja/i)
  expect(summary).toHaveTextContent(/5\.000/)
})

it('no cierra si se cancela la confirmación', async () => {
  const db = await seedWithShift()
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  render(<CashScreen database={db} />)

  await userEvent.type(await screen.findByLabelText(/cantidad de 50\.000/i), '1')
  await userEvent.click(screen.getByRole('button', { name: /cerrar turno/i }))

  expect((await db.shifts.get('shift-1'))?.closedAt).toBeNull()
  expect(screen.getByRole('button', { name: /cerrar turno/i })).toBeInTheDocument()
})
```

Actualizar la prueba existente `cierra con denominaciones y exige nota si hay diferencia` para hacer `vi.spyOn(window, 'confirm').mockReturnValue(true)` antes de cada clic de cierre.

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `cd frontend && npm test -- src/modules/shifts/CashScreen.test.tsx`
Expected: FAIL porque no hay resumen ni confirmación.

- [ ] **Step 3: Implementar**

En `CashScreen`:
- Importar `shiftClosing` y `type ShiftClosing`.
- Estado `const [closing, setClosing] = useState<ShiftClosing | null>(null)`.
- En `refresh`, después de obtener `latest`: `const summary = latest ? await shiftClosing(database, latest.id) : null`; `setClosing(summary)`.
- Pasar `summary={closing}` a `ShiftClosePanel`.

En `ShiftClosePanel`:
- Agregar `summary` a `Props`.
- Antes del formulario de conteo, renderizar un bloque `data-testid="shift-summary"` con:
  - Ventas por medio: Efectivo, Tarjeta, Bre-B (`summary.salesByMethod`).
  - Devoluciones por medio (`summary.refundsByMethod`).
  - Ingresos, Retiros, Gastos de caja (`summary.depositsPesos`, `summary.withdrawalsPesos`, `summary.cashExpensesPesos`).
  - Efectivo esperado usando `expectedPesos` (no `summary.expectedPesos`, que en un turno abierto es 0).
  - Si `summary` es null, mostrar "Cargando resumen…".
- En `onSubmit`, antes de `setSaving(true)`:

```ts
const message = `¿Cerrar el turno?\nContado: $${counted.toLocaleString('es-CO')}\n`
  + `Esperado: $${expectedPesos.toLocaleString('es-CO')}\n`
  + `Diferencia: $${difference.toLocaleString('es-CO')}`
if (!window.confirm(message)) {
  return
}
```

- Mantener la validación de nota de `closeShift`.

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `cd frontend && npm test -- src/modules/shifts/CashScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/shifts/CashScreen.tsx frontend/src/modules/shifts/ShiftClosePanel.tsx frontend/src/modules/shifts/CashScreen.test.tsx
git commit -m "feat: show shift summary and confirm cash close"
```

---

### Task 8: E2E, documentación y verificación final

**Files:**
- Create: `frontend/e2e/menu-cash-pilot.spec.ts`
- Modify: `frontend/e2e/helpers.ts`
- Modify: `docs/endpoints.md`
- Modify: `docs/estado.md`

**Interfaces:**
- Consumes: flujo completo de Tasks 1–7.
- `closeShift` en `helpers.ts` debe aceptar el diálogo de confirmación.

- [ ] **Step 1: Actualizar el helper de cierre**

En `frontend/e2e/helpers.ts`, dentro de `closeShift`, antes del clic final:

```ts
page.once('dialog', (dialog) => void dialog.accept())
await page.getByRole('button', { name: /cerrar turno/i }).click()
```

- [ ] **Step 2: Escribir el E2E**

`frontend/e2e/menu-cash-pilot.spec.ts`:

```ts
test('admin crea un producto y la caja lo vende con el precio nuevo', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page, 'admin', 'caja123')
  await registerDevice(page, uniqueDeviceCode('M'))
  await openShift(page, 50000)

  await page.getByRole('link', { name: /administración/i }).click()
  await page.getByRole('button', { name: /catálogo/i }).click()
  await page.getByRole('button', { name: /nuevo producto/i }).click()
  const name = `PRODUCTO E2E ${Date.now()}`
  await page.getByLabel(/^nombre$/i).fill(name)
  await page.getByLabel(/^categoría$/i).selectOption({ label: 'HAMBURGUESAS' })
  await page.getByLabel(/^precio$/i).fill('12300')
  await page.getByRole('button', { name: /guardar producto/i }).click()
  await expect(page.getByText(/producto guardado/i)).toBeVisible({ timeout: 10_000 })

  await page.getByRole('link', { name: /^venta$/i }).click()
  await page.getByLabel(/buscar producto/i).fill(name)
  await expect(page.getByRole('button', { name: new RegExp(name, 'i') })).toBeVisible()
  await page.getByRole('button', { name: new RegExp(name, 'i') }).click()
  await page.getByLabel(/efectivo recibido/i).fill('20000')
  await expect(page.getByText(/vuelto \$7\.700/i)).toBeVisible()
  await page.getByRole('button', { name: /^cobrar$/i }).click()
  await expect(page.getByText(/venta ALM-[A-Z0-9]+-\d+ guardada/i)).toBeVisible({ timeout: 10_000 })
})
```

Agregar un segundo escenario de cierre:

```ts
test('la caja muestra el resumen y confirma el cierre', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page, 'admin', 'caja123')
  await registerDevice(page, uniqueDeviceCode('C'))
  await openShift(page, 50000)
  await sell(page, 'PAPAS AMARILLA')

  await page.getByRole('link', { name: /^caja$/i }).click()
  await expect(page.getByTestId('shift-summary')).toContainText(/ventas efectivo/i)
  await closeShift(page, { 50000: 1, 5000: 1, 2000: 1 })
  await expect(page.getByText(/turno cerrado/i)).toBeVisible()
})
```

- [ ] **Step 3: Documentar**

- `docs/endpoints.md`: agregar `GET /api/catalog/admin` con rol ADMIN y nota de que incluye inactivos.
- `docs/estado.md`: nueva sección "Menú editable y caja de turno real (2026-11-11)" con tareas, verificación y límites conocidos del spec.

- [ ] **Step 4: Verificación completa**

Run:
```bash
cd backend && ./mvnw verify
cd frontend && npm test
cd frontend && npm run build
cd frontend && npx playwright test e2e/menu-cash-pilot.spec.ts
```
Expected: backend y frontend verdes; build correcto; E2E en verde.

- [ ] **Step 5: Commit**

```bash
git add frontend/e2e/menu-cash-pilot.spec.ts frontend/e2e/helpers.ts docs/endpoints.md docs/estado.md
git commit -m "test: cover menu and cash pilot flow"
```

---

## Self-Review

- **Cobertura del spec:** D-28 → Tasks 3–5; D-29 → Task 1; D-30 → Task 2 y 3; D-31 → Task 3; D-32 → Task 6; D-33 → Task 7; D-34 → fuera de alcance declarado; criterios de aceptación → Tasks 3, 6, 7 y 8.
- **Consistencia de tipos:** `AdminSnapshot`/`AdminProduct`/`AdminCategory`/`AdminModifierGroup` se definen en Task 3 y se consumen en Tasks 4–5; `ModifierGroupView.active` se define en Task 1 y se refleja en `ModifierGroupRow` en Task 5; `ShiftClosePanel.summary` se define y consume en Task 7.
- **Pruebas de Review Focus:** 403 admin (Task 1), inactivo fuera de sync (Task 1), grupo inválido 400 (Task 2), efectivo insuficiente (Task 6), cancelar cierre (Task 7), fallo de sync (Task 3).
- **Proporción:** el plan describe interfaces y pruebas; no transcribe los cuerpos de implementación salvo el algoritmo de asignación de grupos y los mensajes exactos.
