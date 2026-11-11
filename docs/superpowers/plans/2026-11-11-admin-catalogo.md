# Administración del catálogo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir Administración › Catálogo en el lugar donde se mantienen adicionales, días, precios por día, combos e ingredientes, sin romper la venta offline ni la sincronización pendiente.

**Architecture:** Se agrega un catálogo nuevo de `addons` (global por sede) y se dejan congeladas las tablas de modificadores para el historial. Los productos referencian adicionales y precios por día; los combos usan `combo_components`; las recetas cuelgan de productos y adicionales. La venta congela adicionales con cantidad en `sale_item_addons` y sigue aceptando payloads antiguos con `modifiers`.

**Tech Stack:** Spring Boot + JdbcTemplate + PostgreSQL/Liquibase, React + Vite + Dexie, JUnit 5 + Testcontainers, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-11-admin-catalogo-design.md`

## Global Constraints

- Dinero en `bigint` y sufijo `_pesos`; nunca `float`, `double` ni `numeric` para dinero.
- Cantidades de ingredientes en `numeric(12,3)`.
- Toda tabla operativa conserva `tenant_id` y `location_id`; las FKs nuevas son compuestas.
- La caja sigue funcionando sin conexión con el catálogo local.
- Los payloads antiguos con `modifiers` deben seguir sincronizando.
- Los nombres y precios de ventas pasadas no se reescriben.
- Día operativo en `America/Bogota`, 1 = lunes … 7 = domingo.
- Textos de interfaz en español; controles con etiqueta accesible.
- Cada tarea termina con sus pruebas verdes y un commit propio.

## Review Focus

Estas fallas son las más probables y cada una queda cubierta por una prueba:

1. **Cola offline con `modifiers`**: una operación pendiente de la versión anterior no debe rechazarse ni perder el adicional. Prueba en Tarea 4.
2. **Precio del día equivocado**: sin precio especial debe regir el base; con precio especial, la tarjeta y el cobro deben usar el de Bogotá, no el del navegador ni la suma de componentes del combo. Pruebas en Tareas 7, 9 y 11.
3. **Cantidad de adicional**: dos tocinetas deben cobrarse dos veces y no fusionarse con una sola. Pruebas en Tareas 8 y 9.
4. **Doble conteo de combos o ventas devueltas** en el consumo de ingredientes. Prueba en Tarea 5.
5. **Migración de modificadores duplicados**: no debe perderse una opción ni cambiar su precio. Prueba de invariantes en Tarea 1.

## File Structure

| Área | Archivos |
|---|---|
| Migraciones | `backend/src/main/resources/db/changelog/026-catalog-addons.yaml`, `027-product-day-prices.yaml`, `028-ingredients-recipes.yaml`, `db.changelog-master.yaml` |
| Catálogo backend | `catalog/CatalogSnapshot.java`, `catalog/CatalogService.java`, `catalog/CatalogController.java` |
| Ventas backend | `sales/CreateSaleCommand.java`, `sales/SaleApplicationService.java`, `synchronization/SyncService.java` |
| Reportes backend | `reports/Summary.java`, `reports/ReportService.java` |
| Catálogo local | `infrastructure/database/schema.ts`, `application/use-cases/catalog/sync-catalog.ts` |
| Venta frontend | `modules/sales/sale-days.ts`, `modules/sales/SaleDaysPicker.tsx`, `modules/sales/cart-lines.ts`, `modules/sales/SaleScreen.tsx`, `application/use-cases/sales/create-sale.ts`, `modules/printing/receipt.ts`, `modules/refunds/OrderDetailPanel.tsx` |
| Admin frontend | `modules/admin/catalog-admin.ts`, `CatalogScreen.tsx`, `ProductForm.tsx`, `AddonsPanel.tsx`, `IngredientsPanel.tsx`, `RecipeEditor.tsx` |
| Reportes frontend | `modules/reports/ReportsScreen.tsx`, `application/use-cases/reports/local-summary.ts` |

---

### Task 1: Migraciones y esquema

**Files:**
- Create: `backend/src/main/resources/db/changelog/026-catalog-addons.yaml`
- Create: `backend/src/main/resources/db/changelog/027-product-day-prices.yaml`
- Create: `backend/src/main/resources/db/changelog/028-ingredients-recipes.yaml`
- Modify: `backend/src/main/resources/db/changelog/db.changelog-master.yaml`
- Modify: `backend/src/test/java/com/caja/shared/SchemaIntegrityIT.java`

**Interfaces:**
- Produces: tablas `addons`, `product_addons`, `sale_item_addons`, `product_day_prices`, `ingredients`, `recipe_items` y tipo `ingredient_unit`.
- Produces: datos migrados desde `modifiers` y `product_modifier_groups`.

- [ ] **Step 1: Escribir la prueba que falla**

En `SchemaIntegrityIT`, agregar las tablas nuevas al `Set.of(...)` y dos pruebas:

```java
@Test void catalogExtensionTablesAndColumnsExist() {
  var columns = jdbc.queryForList(
      "select table_name || '.' || column_name from information_schema.columns "
          + "where table_schema = 'public'", String.class);
  assertTrue(columns.containsAll(Set.of(
      "addons.price_pesos", "product_addons.addon_id", "sale_item_addons.quantity",
      "product_day_prices.weekday", "ingredients.unit", "recipe_items.quantity")));
}

@Test void migrationCopiesLegacyModifiersWithoutDuplicatingNames() {
  var sencillaId = jdbc.queryForObject(
      "select id from products where name = 'SENCILLA'", UUID.class);
  var addonNames = jdbc.queryForList("""
      select a.name from product_addons pa join addons a on a.id = pa.addon_id
      where pa.product_id = ?
      """, String.class, sencillaId);
  assertTrue(addonNames.contains("Carne Angus"));
  assertTrue(addonNames.contains("Papa + Gaseosa Postobon 250ml"));
  assertEquals(0, jdbc.queryForObject("""
      select count(*) from (
        select location_id, name from addons group by location_id, name having count(*) > 1
      ) duplicates
      """, Integer.class));
}
```

- [ ] **Step 2: Correr la prueba y ver el fallo**

Run: `cd backend && ./mvnw test -Dtest=SchemaIntegrityIT`
Expected: FAIL porque las tablas no existen.

- [ ] **Step 3: Implementar migraciones**

`026-catalog-addons.yaml` crea las tres tablas. La copia usa un mapa temporal para no perder precios ni asignaciones:

```sql
create temporary table _addon_candidates on commit drop as
select m.id, m.tenant_id, m.location_id, m.name, m.additional_price_pesos, m.active,
       g.name as group_name,
       row_number() over (partition by m.location_id, m.name
                          order by m.additional_price_pesos desc, m.active desc, m.id) as rn
from modifiers m
join modifier_groups g
  on g.id = m.modifier_group_id and g.tenant_id = m.tenant_id and g.location_id = m.location_id;

create temporary table _addon_map(modifier_id uuid primary key, addon_id uuid not null) on commit drop;

insert into _addon_map(modifier_id, addon_id)
select id, gen_random_uuid() from _addon_candidates;

insert into addons(id, tenant_id, location_id, name, price_pesos, active)
select map.addon_id, c.tenant_id, c.location_id,
       case when c.rn = 1 then c.name else c.name || ' (' || c.group_name || ')' end,
       c.additional_price_pesos, c.active
from _addon_candidates c join _addon_map map on map.modifier_id = c.id;

insert into product_addons(product_id, addon_id, tenant_id, location_id)
select distinct pmg.product_id, map.addon_id, pmg.tenant_id, pmg.location_id
from product_modifier_groups pmg
join modifiers m on m.modifier_group_id = pmg.modifier_group_id
  and m.tenant_id = pmg.tenant_id and m.location_id = pmg.location_id
join _addon_map map on map.modifier_id = m.id
on conflict do nothing;
```

`027-product-day-prices.yaml` crea `product_day_prices` con PK `(product_id, weekday)` y FK compuesta a `products`.

`028-ingredients-recipes.yaml` crea `ingredient_unit`, `ingredients` y `recipe_items` con el check de dueño único y dos índices únicos parciales.

Incluir los tres archivos en `db.changelog-master.yaml` después de `025-caja-operacion.yaml`.

- [ ] **Step 4: Correr la prueba y verla pasar**

Run: `cd backend && ./mvnw test -Dtest=SchemaIntegrityIT`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/changelog backend/src/test/java/com/caja/shared/SchemaIntegrityIT.java
git commit -m "feat: esquema de adicionales, precios por dia e ingredientes"
```

---

### Task 2: Snapshot y CRUD de adicionales e ingredientes

**Files:**
- Modify: `backend/src/main/java/com/caja/catalog/CatalogSnapshot.java`
- Modify: `backend/src/main/java/com/caja/catalog/CatalogService.java`
- Modify: `backend/src/main/java/com/caja/catalog/CatalogController.java`
- Test: `backend/src/test/java/com/caja/catalog/CatalogAdminIT.java`

**Interfaces:**
- Produces: `CatalogSnapshot.AddonView(UUID id, String name, long pricePesos, boolean active, List<RecipeItemView> recipe)`.
- Produces: `CatalogSnapshot.IngredientView(UUID id, String name, String unit, BigDecimal wastePercent, boolean active)`.
- Produces: `CatalogSnapshot.RecipeItemView(UUID ingredientId, BigDecimal quantity)`.
- Produces: `CatalogService.createAddon(...)`, `updateAddon(...)`, `createIngredient(...)`, `updateIngredient(...)`.
- Produces: `GET /api/catalog` y `/admin` con `addons` e `ingredients`.

- [ ] **Step 1: Escribir la prueba que falla**

En `CatalogAdminIT`:

```java
@Test void createsAddonWithRecipeAndIngredient() throws Exception {
  var ingredientId = createIngredient("TOCINETA", "GRAM", 5);
  createAddon("TOCINETA EXTRA", 5000, ingredientId, 30);

  var snapshot = snapshot("/api/catalog/admin");
  var addon = ((List<Map<String, Object>>) snapshot.get("addons")).stream()
      .filter(row -> "TOCINETA EXTRA".equals(row.get("name"))).findFirst().orElseThrow();
  assertEquals(5000, ((Number) addon.get("pricePesos")).longValue());
  var recipe = (List<Map<String, Object>>) addon.get("recipe");
  assertEquals(30.0, ((Number) recipe.get(0).get("quantity")).doubleValue());

  var ingredient = ((List<Map<String, Object>>) snapshot.get("ingredients")).stream()
      .filter(row -> "TOCINETA".equals(row.get("name"))).findFirst().orElseThrow();
  assertEquals("GRAM", ingredient.get("unit"));
}

@Test void inactiveAddonLeavesThePublicSnapshot() throws Exception {
  var ingredientId = createIngredient("QUESO", "UNIT", 0);
  var addonId = createAddon("QUESO EXTRA", 3000, ingredientId, 1);
  updateAddon(addonId, false);
  assertFalse(publicNames("/api/catalog", "addons").contains("QUESO EXTRA"));
  assertTrue(adminNames("addons").contains("QUESO EXTRA"));
}
```

- [ ] **Step 2: Correr la prueba y ver el fallo**

Run: `cd backend && ./mvnw test -Dtest=CatalogAdminIT`
Expected: FAIL porque `addons` e `ingredients` no existen.

- [ ] **Step 3: Implementar snapshot y endpoints**

En `CatalogService.snapshot`, después de cargar grupos, cargar:

```java
var addons = jdbc.query("""
    select id, name, price_pesos, active from addons
    where tenant_id = ? and location_id = ? and (? or active)
    order by name
    """, ..., tenantId.value(), locationId, includeInactive);

var ingredients = jdbc.query("""
    select id, name, unit, waste_percent, active from ingredients
    where tenant_id = ? and location_id = ? and (? or active)
    order by name
    """, ...);
```

Cargar `recipe_items` de productos y adicionales en mapas y completar las vistas. Mantener `modifierGroups` y `modifierGroupIds` legacy.

En `CatalogController`, agregar:

```java
@PostMapping("/addons")  // y PUT /addons/{id}
public ResponseEntity<Map<String, Object>> createAddon(@Valid @RequestBody AddonRequest request, ...)
@PostMapping("/ingredients")  // y PUT /ingredients/{id}
public ResponseEntity<Map<String, Object>> createIngredient(...)
```

Records de request con `@NotBlank`, `@PositiveOrZero`, `@Pattern(regexp = "UNIT|GRAM")`, `@DecimalMin("0")`, `@DecimalMax("100")` y `List<@Valid RecipeItemRequest>`.

`createAddon`/`updateAddon` validan ingredientes de la sede y reemplazan la receta completa. `createIngredient`/`updateIngredient` validan unidad y merma. Cada método llama `bumpVersion`.

- [ ] **Step 4: Correr la prueba y verla pasar**

Run: `cd backend && ./mvnw test -Dtest=CatalogAdminIT`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/caja/catalog backend/src/test/java/com/caja/catalog/CatalogAdminIT.java
git commit -m "feat: adicionales e ingredientes en el catalogo"
```

---

### Task 3: Producto con adicionales, precios por día, receta y combo

**Files:**
- Modify: `backend/src/main/java/com/caja/catalog/CatalogService.java`
- Modify: `backend/src/main/java/com/caja/catalog/CatalogController.java`
- Modify: `backend/src/main/java/com/caja/catalog/CatalogSnapshot.java`
- Test: `backend/src/test/java/com/caja/catalog/CatalogIT.java`

**Interfaces:**
- Produces: `ProductView` con `addonIds`, `dayPrices`, `recipe` y `components`.
- Produces: `CatalogService.ProductInput` y `ProductUpdateInput`.
- Consumes: tablas de Tarea 1 y endpoints de Tarea 2.

- [ ] **Step 1: Escribir las pruebas que fallan**

```java
@Test void createsProductWithAddonsDayPricesAndRecipe() throws Exception {
  var ingredientId = ingredient("CARNE", "UNIT", 0);
  var addonId = addon("TOCINETA", 5000, ingredientId, 30);
  mvc.perform(post("/api/catalog/products").contentType(MediaType.APPLICATION_JSON)
          .header("Authorization", "Bearer " + adminToken("admin_producto_completo"))
          .content(json.writeValueAsString(Map.of(
              "name", "HAMBURGUESA COMPLETA", "pricePesos", 20000,
              "saleDays", List.of(1, 2, 3, 4),
              "addonIds", List.of(addonId),
              "dayPrices", List.of(Map.of("weekday", 1, "pricePesos", 18000)),
              "recipe", List.of(Map.of("ingredientId", ingredientId, "quantity", 120)))))
      .andExpect(status().isCreated());

  var product = product(snapshot(), "HAMBURGUESA COMPLETA");
  assertEquals(List.of(1, 2, 3, 4), product.get("saleDays"));
  assertEquals(List.of(addonId.toString()), product.get("addonIds"));
  assertEquals(18000, ((List<Map<String, Object>>) product.get("dayPrices")).get(0).get("pricePesos"));
  assertEquals(120.0, ((List<Map<String, Object>>) product.get("recipe")).get(0).get("quantity"));
}

@Test void createsComboWithComponentsAndRejectsBadCompositions() throws Exception {
  var sencilla = productId("SENCILLA");
  var papas = productId("PAPAS A LA FRANCESA");
  mvc.perform(post("/api/catalog/products").contentType(MediaType.APPLICATION_JSON)
          .header("Authorization", "Bearer " + adminToken("admin_combo"))
          .content(json.writeValueAsString(Map.of(
              "name", "COMBO PRUEBA", "pricePesos", 25000, "kind", "COMBO",
              "components", List.of(
                  Map.of("productId", sencilla, "quantity", 2),
                  Map.of("productId", papas, "quantity", 1))))))
      .andExpect(status().isCreated());
  assertEquals(2, ((List<?>) product(snapshot(), "COMBO PRUEBA").get("components")).size());

  mvc.perform(post("/api/catalog/products").contentType(MediaType.APPLICATION_JSON)
          .header("Authorization", "Bearer " + adminToken("admin_combo_malo"))
          .content(json.writeValueAsString(Map.of(
              "name", "COMBO VACIO", "pricePesos", 1000, "kind", "COMBO", "components", List.of()))))
      .andExpect(status().isBadRequest());
}
```

- [ ] **Step 2: Correr las pruebas y ver el fallo**

Run: `cd backend && ./mvnw test -Dtest=CatalogIT`
Expected: FAIL porque el contrato no acepta los campos nuevos.

- [ ] **Step 3: Implementar el contrato y las validaciones**

En `CatalogService`:

- `createProduct` y `updateProduct` reciben `ProductInput`/`ProductUpdateInput`.
- `replaceAddons`: borra e inserta `product_addons`; valida que cada adicional exista en la sede.
- `replaceDayPrices`: reemplaza; rechaza días repetidos o fuera de 1–7.
- `replaceRecipe`: reemplaza `recipe_items` del producto; rechaza receta en `COMBO`.
- `replaceComponents`: reemplaza `combo_components`; exige al menos uno para `COMBO`, rechaza el propio producto, rechaza componentes `COMBO` y valida que existan en la sede.
- `null` significa “no cambiar”; `[]` significa “limpiar”.

En `CatalogController.ProductRequest/ProductUpdate` agregar:

```java
List<@NotNull UUID> addonIds,
List<@NotNull @Valid DayPriceRequest> dayPrices,
List<@NotNull @Valid RecipeItemRequest> recipe,
List<@NotNull @Valid ComponentRequest> components
```

- [ ] **Step 4: Correr las pruebas y verlas pasar**

Run: `cd backend && ./mvnw test -Dtest=CatalogIT`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/caja/catalog backend/src/test/java/com/caja/catalog/CatalogIT.java
git commit -m "feat: productos con adicionales, precios por dia y composicion"
```

---

### Task 4: Venta sincronizada con adicionales por cantidad

**Files:**
- Modify: `backend/src/main/java/com/caja/sales/CreateSaleCommand.java`
- Modify: `backend/src/main/java/com/caja/sales/SaleApplicationService.java`
- Modify: `backend/src/main/java/com/caja/synchronization/SyncService.java`
- Test: `backend/src/test/java/com/caja/synchronization/SyncIT.java`
- Test: `backend/src/test/java/com/caja/sales/SaleApplicationIT.java`

**Interfaces:**
- Produces: `CreateSaleCommand.AddonCommand(UUID addonId, String addonName, long additionalPricePesos, int quantity)`.
- Produces: payload `addons: [{ addonId, addonName, additionalPricePesos, quantity }]`.
- Consumes: `addons` y `sale_item_addons` de Tarea 1.
- Mantiene: lectura de `modifiers` cuando no llega `addons`.

- [ ] **Step 1: Escribir la prueba que falla**

En `SyncIT`, agregar un helper y una prueba:

```java
@Test void addonsWithQuantityChangeTheTotalAndAreFrozen() throws Exception {
  var ctx = fixture();
  var addonId = addon(ctx, "TOCINETA", 5000);

  var result = push(ctx, List.of(saleOperationWithAddons(ctx, "op-addons", 1, 16500,
      addonId, 2)));

  assertEquals("APPLIED", syncStatus(result.get(0)));
  assertEquals(26500L, jdbc.queryForObject(
      "select total_pesos from sales where tenant_id = ?", Long.class, ctx.tenantId()));
  assertEquals(2, jdbc.queryForObject(
      "select quantity from sale_item_addons where tenant_id = ?", Integer.class, ctx.tenantId()));
}
```

El helper `saleOperationWithAddons` arma el `item` con `addons` y sin `payments`, para que el servidor calcule el total.

- [ ] **Step 2: Correr la prueba y ver el fallo**

Run: `cd backend && ./mvnw test -Dtest=SyncIT`
Expected: FAIL porque `addons` se ignora.

- [ ] **Step 3: Implementar el comando y la persistencia**

`CreateSaleCommand`:

```java
public record AddonCommand(UUID addonId, String addonName, long additionalPricePesos, int quantity) {}
```

`ItemCommand` agrega `List<AddonCommand> addons`. `CreateSaleCommand.lineTotal` (y el `lineTotal` privado de `SaleApplicationService`) suma:

```java
var addons = item.addons().stream()
    .mapToLong(addon -> addon.additionalPricePesos() * addon.quantity()).sum();
return (long) item.quantity() * (item.unitPricePesos() + modifiers + addons);
```

`SaleApplicationService` inserta cada adicional en `sale_item_addons` con nombre, precio y cantidad congelados.

`SyncService.toSaleCommand` lee `addons`; si no existe o viene vacío, deja la lista vacía y sigue leyendo `modifiers` como hoy.

Actualizar `SaleApplicationIT`: los constructores de `ItemCommand` reciben `List.of()` en la posición de `addons`, y se agrega una prueba de línea con adicionales si el helper lo permite.

- [ ] **Step 4: Correr las pruebas y verlas pasar**

Run: `cd backend && ./mvnw test -Dtest=SyncIT,SaleApplicationIT`
Expected: PASS. Las pruebas antiguas sin `addons` siguen pasando.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/caja/sales backend/src/main/java/com/caja/synchronization backend/src/test/java/com/caja/synchronization/SyncIT.java backend/src/test/java/com/caja/sales/SaleApplicationIT.java
git commit -m "feat: adicionales con cantidad en la venta sincronizada"
```

---

### Task 5: Reporte de consumo de ingredientes

**Files:**
- Modify: `backend/src/main/java/com/caja/reports/Summary.java`
- Modify: `backend/src/main/java/com/caja/reports/ReportService.java`
- Test: `backend/src/test/java/com/caja/reports/ReportsIT.java`

**Interfaces:**
- Produces: `Summary` con `List<IngredientRow> byIngredient` y `BigDecimal recipeCoveragePercent`.
- Produces: `IngredientRow(String name, String unit, BigDecimal quantity, BigDecimal wastePercent)`.
- `quantity` ya incluye la merma.

- [ ] **Step 1: Escribir las pruebas que fallan**

```java
@Test void sumsTheoreticalConsumptionWithoutDoubleCountingCombos() throws Exception {
  var ctx = fixture();
  var carne = ingredient(ctx, "CARNE", "UNIT", 0);
  var tocineta = ingredient(ctx, "TOCINETA", "GRAM", 10);
  var addon = addon(ctx, "TOCINETA EXTRA", tocineta, 30);
  recipe(ctx, ctx.productId(), carne, 1);
  var combo = combo(ctx, "COMBO", ctx.productId(), 2);

  saleWithComponent(ctx, combo, 2, addon, 2);

  var summary = summary(ctx);
  var rows = (List<Map<String, Object>>) summary.get("byIngredient");
  assertEquals(4.0, row(rows, "CARNE").get("quantity")); // 2 combos × 2 componentes
  assertEquals(132.0, row(rows, "TOCINETA").get("quantity")); // 2 líneas × 2 adicionales × 30g × 1.10
}

@Test void summaryExcludesRefundedSalesFromConsumption() throws Exception {
  var ctx = fixture();
  var carne = ingredient(ctx, "CARNE", "UNIT", 0);
  recipe(ctx, ctx.productId(), carne, 1);
  saleWithStatus(ctx, ctx.productId(), 3, "REFUNDED");
  assertEquals(0.0, firstIngredientQuantity(summary(ctx)));
}
```

Agregar helpers con `jdbc.update` que inserten `ingredients`, `recipe_items`, `combo_components`, `sale_item_addons` y `sale_item_components` sobre el `Ctx` existente.

- [ ] **Step 2: Correr las pruebas y ver el fallo**

Run: `cd backend && ./mvnw test -Dtest=ReportsIT`
Expected: FAIL porque `byIngredient` no existe.

- [ ] **Step 3: Implementar las consultas**

En `ReportService`, una CTE `usages` con tres ramas excluyentes:

1. Líneas sin componentes (producto directo) × receta del producto.
2. Líneas con `sale_item_components` × cantidad del componente × receta del componente.
3. `sale_item_addons` × cantidad del adicional × receta del adicional.

Todas filtran `s.status <> 'REFUNDED'`. La rama 1 exige `not exists (select 1 from sale_item_components ...)` para no contar el combo y sus hijos.

Agregar la merma en el `select` final:

```sql
sum(u.qty) * (1 + i.waste_percent / 100) as quantity
```

Cobertura en dos consultas: unidades de producto (combo cubierto solo si todos sus componentes tienen receta) y unidades de adicional. `recipeCoveragePercent = cubiertas / totales * 100`, redondeado a un decimal; 100 si no hay unidades.

- [ ] **Step 4: Correr las pruebas y verlas pasar**

Run: `cd backend && ./mvnw test -Dtest=ReportsIT`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/caja/reports backend/src/test/java/com/caja/reports/ReportsIT.java
git commit -m "feat: reporte de consumo teorico de ingredientes"
```

---

### Task 6: Catálogo local y sincronización

**Files:**
- Modify: `frontend/src/infrastructure/database/schema.ts`
- Modify: `frontend/src/application/use-cases/catalog/sync-catalog.ts`
- Test: `frontend/src/application/use-cases/catalog/sync-catalog.test.ts`
- Test: `frontend/src/infrastructure/database/schema.test.ts`

**Interfaces:**
- Produces: `AddonRow`, `SaleAddonRow`, `DayPriceRow`, `RecipeItemRow`, `IngredientRow`.
- Produces: `ProductRow.addonIds?: string[]`, `ProductRow.dayPrices?: DayPriceRow[]`, `ProductRow.recipe?: RecipeItemRow[]` (opcionales para no romper fixtures y catálogos locales viejos).
- Produces: `CajaDb.addons`.
- Consumes: snapshot de Tarea 2/3.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `sync-catalog.test.ts`, ampliar `snapshot` con `addons` y un producto con `addonIds` y `dayPrices`, y agregar:

```ts
it('guarda adicionales y precios por dia en la caja local', async () => {
  const db = openDb('test-catalog-addons')
  opened.push(db)

  await syncCatalog(db, async () => snapshot)

  expect(await db.addons.count()).toBe(1)
  expect((await db.products.get('p1'))?.addonIds).toEqual(['a1'])
  expect((await db.products.get('p1'))?.dayPrices).toEqual([{ weekday: 1, pricePesos: 15000 }])
  // `await db.products.get('p1')` debe traer addonIds y dayPrices normalizados a [] si faltan.
})

it('acepta un snapshot viejo sin adicionales', async () => {
  const db = openDb('test-catalog-legacy')
  opened.push(db)
  const legacy = { ...snapshot, addons: undefined,
    products: snapshot.products.map(({ addonIds, dayPrices, ...product }) => product) }

  await syncCatalog(db, async () => legacy as never)

  expect((await db.products.get('p1'))?.addonIds).toEqual([])
  expect((await db.products.get('p1'))?.dayPrices).toEqual([])
})
```

- [ ] **Step 2: Correr las pruebas y ver el fallo**

Run: `cd frontend && npx vitest run src/application/use-cases/catalog/sync-catalog.test.ts`
Expected: FAIL porque `db.addons` no existe.

- [ ] **Step 3: Implementar el esquema local y la sincronización**

En `schema.ts`, agregar los tipos y la tabla, y subir Dexie:

```ts
this.version(5).stores({
  addons: 'id'
})
```

`syncCatalog` limpia y llena `addons`, y normaliza cada producto:

```ts
const products = remote.products.map((product) => ({
  ...product,
  addonIds: product.addonIds ?? [],
  dayPrices: product.dayPrices ?? [],
  recipe: product.recipe ?? []
}))
```

No borrar `modifierGroups` todavía: la tabla puede quedar con datos viejos sin uso.

- [ ] **Step 4: Correr las pruebas y verlas pasar**

Run: `cd frontend && npx vitest run src/application/use-cases/catalog/sync-catalog.test.ts src/infrastructure/database/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/infrastructure/database/schema.ts frontend/src/application/use-cases/catalog frontend/src/infrastructure/database/schema.test.ts
git commit -m "feat: adicionales y precios por dia en el catalogo local"
```

---

### Task 7: Días y precio efectivo

**Files:**
- Modify: `frontend/src/modules/sales/sale-days.ts`
- Test: `frontend/src/modules/sales/sale-days.test.ts`
- Create: `frontend/src/modules/sales/SaleDaysPicker.tsx`
- Test: `frontend/src/modules/sales/SaleDaysPicker.test.tsx`

**Interfaces:**
- Produces: `effectivePrice(product, now?): number`.
- Produces: `SALE_DAY_LABELS` y `SaleDaysPicker({ value, onChange })`.
- Consumes: `bogotaWeekday`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
it('usa el precio especial del dia de Bogota', () => {
  const monday = new Date('2026-11-09T15:00:00Z')
  expect(effectivePrice({ pricePesos: 35000,
    dayPrices: [{ weekday: 1, pricePesos: 30000 }] }, monday)).toBe(30000)
  expect(effectivePrice({ pricePesos: 35000, dayPrices: [] }, monday)).toBe(35000)
})

it('formatea los dias con nombres legibles', () => {
  expect(formatSaleDays([1, 2, 3, 4])).toBe('Lun, Mar, Mié, Jue')
  expect(formatSaleDays([])).toBe('')
})
```

En `SaleDaysPicker.test.tsx`:

```tsx
it('marca dias y aplica atajos', async () => {
  const onChange = vi.fn()
  const { rerender } = render(<SaleDaysPicker value={[]} onChange={onChange} />)

  await userEvent.click(screen.getByLabelText(/^lunes$/i))
  expect(onChange).toHaveBeenCalledWith([1])

  rerender(<SaleDaysPicker value={[1, 2]} onChange={onChange} />)
  await userEvent.click(screen.getByRole('button', { name: /lun-jue/i }))
  expect(onChange).toHaveBeenCalledWith([1, 2, 3, 4])

  await userEvent.click(screen.getByRole('button', { name: /^todos$/i }))
  expect(onChange).toHaveBeenCalledWith([])
})
```

- [ ] **Step 2: Correr las pruebas y ver el fallo**

Run: `cd frontend && npx vitest run src/modules/sales/sale-days.test.ts src/modules/sales/SaleDaysPicker.test.tsx`
Expected: FAIL porque `effectivePrice` y el componente no existen.

- [ ] **Step 3: Implementar**

`effectivePrice`:

```ts
export function effectivePrice(
  product: Pick<ProductRow, 'pricePesos' | 'dayPrices'>,
  now = new Date()
): number {
  const weekday = bogotaWeekday(now)
  return product.dayPrices?.find((row) => row.weekday === weekday)?.pricePesos
    ?? product.pricePesos
}
```

`formatSaleDays` usa `SALE_DAY_LABELS` con nombres completos y devuelve `''` para todos los días.

`SaleDaysPicker` es un `fieldset` con `legend` "Días de venta", siete checkboxes reales con etiquetas `Lunes`…`Domingo` y tres botones de atajo: `Todos` (valor `[]`), `Lun-Jue` (`[1,2,3,4]`) y `Vie-Dom` (`[5,6,7]`).

- [ ] **Step 4: Correr las pruebas y verlas pasar**

Run: `cd frontend && npx vitest run src/modules/sales/sale-days.test.ts src/modules/sales/SaleDaysPicker.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/sales/sale-days.ts frontend/src/modules/sales/sale-days.test.ts frontend/src/modules/sales/SaleDaysPicker.tsx frontend/src/modules/sales/SaleDaysPicker.test.tsx
git commit -m "feat: seleccion visual de dias y precio efectivo"
```

---

### Task 8: Carrito, total y comprobante con adicionales

**Files:**
- Modify: `frontend/src/infrastructure/database/schema.ts`
- Create: `frontend/src/modules/sales/addons.ts`
- Modify: `frontend/src/modules/sales/cart-lines.ts`
- Test: `frontend/src/modules/sales/cart-lines.test.ts`
- Modify: `frontend/src/application/use-cases/sales/create-sale.ts`
- Test: `frontend/src/application/use-cases/sales/create-sale.test.ts`
- Modify: `frontend/src/modules/printing/receipt.ts`
- Test: `frontend/src/modules/printing/receipt.test.ts`
- Modify: `frontend/src/modules/refunds/OrderDetailPanel.tsx`

**Interfaces:**
- Produces: `SaleAddonRow { id, name, pricePesos, quantity }`.
- Produces: `CartLine.addons: SaleAddonRow[]`.
- Produces: `addToCart(cart, product, addons, unitPricePesos)`.
- Produces: `SaleItemInput.addons: SaleAddonRow[]`.
- Produces: `saleItemAddons(item): SaleAddonRow[]` para leer ventas nuevas y viejas.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
it('cobra el adicional por su cantidad', () => {
  const item = saleItem({ quantity: 1, unitPricePesos: 16500,
    addons: [{ id: 'a1', name: 'Tocineta', pricePesos: 5000, quantity: 2 }] })
  expect(lineTotal(item)).toBe(26500)
})

it('no fusiona dos adicionales iguales con cantidades distintas', () => {
  const first = addToCart([], product,
    [{ id: 'a1', name: 'Tocineta', pricePesos: 5000, quantity: 1 }], 16500)
  const next = addToCart(first, product,
    [{ id: 'a1', name: 'Tocineta', pricePesos: 5000, quantity: 2 }], 16500)
  expect(next).toHaveLength(2)
})
```

En `receipt.test.ts`:

```ts
it('muestra la cantidad del adicional y su total', () => {
  const html = buildReceiptHtml(dataWith({
    addons: [{ id: 'a1', name: 'Tocineta', pricePesos: 5000, quantity: 2 }]
  }))
  expect(html).toContain('2 × Tocineta')
  expect(html).toContain('$10.000')
})
```

- [ ] **Step 2: Correr las pruebas y ver el fallo**

Run: `cd frontend && npx vitest run src/modules/sales/cart-lines.test.ts src/application/use-cases/sales/create-sale.test.ts src/modules/printing/receipt.test.ts`
Expected: FAIL porque `addons` no existe en los tipos.

- [ ] **Step 3: Implementar**

- `saleItemAddons` normaliza `item.addons` o, si no existe, convierte `item.modifiers` con cantidad 1.
- `sameAddons` compara `id` y `quantity` ordenados.
- `addToCart` recibe `unitPricePesos` y guarda `addons`.
- `lineTotal` usa `pricePesos × quantity` por adicional.
- `createSale` guarda `addons` en `SaleItemRow` y envía `addons` al payload con `addonId`, `addonName`, `additionalPricePesos`, `quantity`. Actualizar `baseInput()` y las fixtures de `create-sale.test.ts` para usar `addons: []`.
- `saleItemAddons` vive en `modules/sales/addons.ts` y normaliza ventas nuevas (`addons`) y viejas (`modifiers` con cantidad 1).
- `receipt.ts` y `OrderDetailPanel` usan `saleItemAddons(item)` y muestran `cantidad × nombre` y el total del adicional.

- [ ] **Step 4: Correr las pruebas y verlas pasar**

Run: `cd frontend && npx vitest run src/modules/sales/cart-lines.test.ts src/application/use-cases/sales/create-sale.test.ts src/modules/printing/receipt.test.ts src/modules/refunds`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/infrastructure/database/schema.ts frontend/src/modules/sales/cart-lines.ts frontend/src/modules/sales/cart-lines.test.ts frontend/src/application/use-cases/sales frontend/src/modules/printing frontend/src/modules/refunds
git commit -m "feat: adicionales con cantidad en carrito y comprobante"
```

---

### Task 9: Pantalla de venta

**Files:**
- Modify: `frontend/src/modules/sales/SaleScreen.tsx`
- Test: `frontend/src/modules/sales/SaleScreen.test.tsx`

**Interfaces:**
- Consumes: `effectivePrice`, `CajaDb.addons`, `SaleAddonRow`.
- Produces: modal de adicionales con cantidad y precio efectivo del día.

- [ ] **Step 1: Escribir las pruebas que fallan**

```tsx
it('permite dos tocinetas y cobra el doble', async () => {
  const db = await productWithAddons(16500, [{ id: 'a1', name: 'Tocineta', pricePesos: 5000 }])
  renderScreen({ database: db })

  await userEvent.click(await screen.findByRole('button', { name: /sencilla/i }))
  await userEvent.click(screen.getByLabelText(/tocineta/i))
  await userEvent.click(screen.getByRole('button', { name: /agregar tocineta/i }))
  await userEvent.click(screen.getByRole('button', { name: /^agregar$/i }))

  const cart = screen.getByRole('region', { name: 'Carrito' })
  expect(within(cart).getByText(/2 × tocineta/i)).toBeInTheDocument()
  expect(within(cart).getByText(/total \$26\.500/i)).toBeInTheDocument()
})

it('usa el precio del dia en la tarjeta y en el cobro', async () => {
  const today = bogotaWeekday(new Date())
  const db = await productWithDayPrice(35000, today, 30000)
  renderScreen({ database: db })

  const card = await screen.findByRole('button', { name: /voz y yo/i })
  expect(card).toHaveTextContent('$30.000')
  await userEvent.click(card)
  expect(screen.getByText(/total \$30\.000/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Correr las pruebas y ver el fallo**

Run: `cd frontend && npx vitest run src/modules/sales/SaleScreen.test.tsx`
Expected: FAIL porque la pantalla aún usa grupos de modificadores.

- [ ] **Step 3: Implementar**

- Cargar `database.addons.toArray()` en el `useEffect`.
- `pick(product)`: si `product.addonIds ?? []` está vacío, agregar directo; si no, abrir modal.
- Modal: por cada adicional permitido, checkbox con su nombre y precio; si está marcado, controles `−`/`+` con etiquetas `Quitar {nombre}` y `Agregar {nombre}`.
- `confirmModifiers` se reemplaza por `confirmAddons`; arma `SaleAddonRow[]` con cantidad y llama `addToCart(..., effectivePrice(product))`.
- El carrito muestra `cantidad × nombre` y el subtotal por adicional.
- La tarjeta usa `effectivePrice(product, now)`; el precio de catálogo del carrito es ese mismo.
- Las familias usan el precio efectivo del primer variante.

- [ ] **Step 4: Correr las pruebas y verlas pasar**

Run: `cd frontend && npx vitest run src/modules/sales/SaleScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/sales/SaleScreen.tsx frontend/src/modules/sales/SaleScreen.test.tsx
git commit -m "feat: adicionales con cantidad y precio del dia en la venta"
```

---

### Task 10: Administración con subsecciones y formulario de producto

**Files:**
- Modify: `frontend/src/modules/admin/catalog-admin.ts`
- Modify: `frontend/src/modules/admin/CatalogScreen.tsx`
- Modify: `frontend/src/modules/admin/ProductForm.tsx`
- Create: `frontend/src/modules/admin/RecipeEditor.tsx`
- Test: `frontend/src/modules/admin/CatalogScreen.test.tsx`
- Test: `frontend/src/modules/admin/ProductForm.test.tsx`

**Interfaces:**
- Produces: `AdminAddon`, `AdminIngredient`, `RecipeItemInput`, `DayPriceInput`.
- Produces: `ProductInput` con `addonIds`, `dayPrices`, `recipe`, `components`.
- Produces: subsecciones `Productos · Combos · Adicionales · Ingredientes · Categorías`.
- Consumes: `SaleDaysPicker` y snapshot de Tareas 2/3.

- [ ] **Step 1: Escribir las pruebas que fallan**

```tsx
it('guarda dias, precio por dia, adicionales y receta', async () => {
  mockAdminSnapshot({
    products: [], categories: [category()],
    addons: [{ id: 'a1', name: 'Tocineta', pricePesos: 5000, active: true, recipe: [] }],
    ingredients: [{ id: 'i1', name: 'Carne', unit: 'UNIT', wastePercent: 0, active: true }]
  })
  render(<CatalogScreen database={await db()} />)

  await userEvent.click(await screen.findByRole('button', { name: /nuevo producto/i }))
  await userEvent.type(screen.getByLabelText(/^nombre$/i), 'HAMBURGUESA')
  await userEvent.type(screen.getByLabelText(/^precio$/i), '20000')
  await userEvent.click(screen.getByLabelText(/^lunes$/i))
  await userEvent.type(screen.getByLabelText(/precio del lunes/i), '18000')
  await userEvent.click(screen.getByLabelText(/tocineta/i))
  await userEvent.selectOptions(screen.getByLabelText(/ingrediente 1/i), 'i1')
  await userEvent.type(screen.getByLabelText(/cantidad 1/i), '120')
  await userEvent.click(screen.getByRole('button', { name: /guardar producto/i }))

  const body = JSON.parse(String(vi.mocked(request).mock.calls.find(
    ([path]) => path === '/api/catalog/products')?.[1]?.body))
  expect(body).toMatchObject({
    saleDays: [1],
    dayPrices: [{ weekday: 1, pricePesos: 18000 }],
    addonIds: ['a1'],
    recipe: [{ ingredientId: 'i1', quantity: 120 }]
  })
})

```

- [ ] **Step 2: Correr las pruebas y ver el fallo**

Run: `cd frontend && npx vitest run src/modules/admin/CatalogScreen.test.tsx`
Expected: FAIL porque el formulario no tiene los campos ni las subsecciones.

- [ ] **Step 3: Implementar**

- `CatalogScreen` mantiene el snapshot y una subsección activa. Renderiza la tabla de productos o combos según filtro y conserva búsqueda, categoría, edición y avisos.
- En esta tarea, `Adicionales` e `Ingredientes` muestran un `Card` vacío con el texto `Sin adicionales.` / `Sin ingredientes.`; las tareas 12 y 13 los reemplazan por los paneles reales. Así cada tarea queda compilando y con pruebas verdes.
- `ProductForm` recibe `addons` e `ingredients`, muestra `SaleDaysPicker`, una fila por día para precio especial con etiqueta `Precio del lunes` … `Precio del domingo` y placeholder del precio base, checkboxes de adicionales y `RecipeEditor` para productos.
- `RecipeEditor` tiene filas `Ingrediente N`, `Cantidad N`, muestra la unidad del ingrediente seleccionado y botón `Agregar ingrediente`.
- Al guardar, filtra precios vacíos o iguales al base y envía las listas normalizadas.

- [ ] **Step 4: Correr las pruebas y verlas pasar**

Run: `cd frontend && npx vitest run src/modules/admin/CatalogScreen.test.tsx src/modules/admin/ProductForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/admin/catalog-admin.ts frontend/src/modules/admin/CatalogScreen.tsx frontend/src/modules/admin/ProductForm.tsx frontend/src/modules/admin/RecipeEditor.tsx frontend/src/modules/admin/CatalogScreen.test.tsx frontend/src/modules/admin/ProductForm.test.tsx
git commit -m "feat: administracion de productos con dias, precios, adicionales y receta"
```

---

### Task 11: Composición de combos

**Files:**
- Modify: `frontend/src/modules/admin/ProductForm.tsx`
- Modify: `frontend/src/modules/admin/CatalogScreen.tsx`
- Test: `frontend/src/modules/admin/ProductForm.test.tsx`
- Test: `frontend/src/modules/admin/CatalogScreen.test.tsx`

**Interfaces:**
- Consumes: `ProductForm` de Tarea 10.
- Produces: editor de componentes para `kind = COMBO`.

- [ ] **Step 1: Escribir la prueba que falla**

```tsx
it('crea un combo con productos y cantidades', async () => {
  mockAdminSnapshot({
    products: [product({ id: 'p1', name: 'SENCILLA', kind: 'PRODUCT' })],
    categories: [category()], addons: [], ingredients: []
  })
  render(<CatalogScreen database={await db()} />)

  await userEvent.click(await screen.findByRole('button', { name: /nuevo combo/i }))
  await userEvent.type(screen.getByLabelText(/^nombre$/i), 'COMBO PRUEBA')
  await userEvent.type(screen.getByLabelText(/^precio$/i), '25000')
  await userEvent.selectOptions(screen.getByLabelText(/producto componente/i), 'p1')
  await userEvent.clear(screen.getByLabelText(/cantidad del componente/i))
  await userEvent.type(screen.getByLabelText(/cantidad del componente/i), '2')
  await userEvent.click(screen.getByRole('button', { name: /agregar componente/i }))
  await userEvent.click(screen.getByRole('button', { name: /guardar producto/i }))

  const body = JSON.parse(String(vi.mocked(request).mock.calls.find(
    ([path]) => path === '/api/catalog/products')?.[1]?.body))
  expect(body).toMatchObject({
    kind: 'COMBO',
    components: [{ productId: 'p1', quantity: 2 }]
  })
})
```

- [ ] **Step 2: Correr la prueba y ver el fallo**

Run: `cd frontend && npx vitest run src/modules/admin/ProductForm.test.tsx`
Expected: FAIL porque no existe el editor de componentes.

- [ ] **Step 3: Implementar**

- `CatalogScreen` agrega `Nuevo combo` y filtra la tabla a `kind === 'COMBO'` en la subsección Combos.
- `ProductForm` detecta `kind === 'COMBO'` y muestra `Composición` en lugar de `Receta`.
- El editor tiene un `select` `Producto componente` con productos `PRODUCT` activos, un input `Cantidad del componente` (1–99) y botón `Agregar componente`.
- La lista de componentes permite quitar cada uno.
- No se puede guardar un combo sin componentes; se muestra `El combo necesita al menos un componente`.

- [ ] **Step 4: Correr las pruebas y verlas pasar**

Run: `cd frontend && npx vitest run src/modules/admin/ProductForm.test.tsx src/modules/admin/CatalogScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/admin/ProductForm.tsx frontend/src/modules/admin/CatalogScreen.tsx frontend/src/modules/admin/ProductForm.test.tsx frontend/src/modules/admin/CatalogScreen.test.tsx
git commit -m "feat: crear y editar combos con componentes"
```

---

### Task 12: Panel de adicionales

**Files:**
- Create: `frontend/src/modules/admin/AddonsPanel.tsx`
- Test: `frontend/src/modules/admin/AddonsPanel.test.tsx`
- Modify: `frontend/src/modules/admin/CatalogScreen.tsx`
- Test: `frontend/src/modules/admin/CatalogScreen.test.tsx`
- Delete: `frontend/src/modules/admin/ModifierGroupPanel.tsx`
- Delete: `frontend/src/modules/admin/ModifierGroupPanel.test.tsx`

**Interfaces:**
- Produces: `AddonsPanel({ addons, ingredients, onChanged })`.
- Consumes: `POST/PUT /api/catalog/addons` y `RecipeEditor`.

- [ ] **Step 1: Escribir la prueba que falla**

```tsx
it('crea un adicional con precio y receta', async () => {
  vi.mocked(request).mockResolvedValue({} as never)
  const onChanged = vi.fn().mockResolvedValue(undefined)
  render(<AddonsPanel addons={[]} ingredients={[
    { id: 'i1', name: 'Tocineta', unit: 'GRAM', wastePercent: 5, active: true }
  ]} onChanged={onChanged} />)

  await userEvent.type(screen.getByLabelText(/nombre del adicional/i), 'Tocineta extra')
  await userEvent.type(screen.getByLabelText(/^precio$/i), '5000')
  await userEvent.selectOptions(screen.getByLabelText(/ingrediente 1/i), 'i1')
  await userEvent.type(screen.getByLabelText(/cantidad 1/i), '30')
  await userEvent.click(screen.getByRole('button', { name: /crear adicional/i }))

  expect(vi.mocked(request).mock.calls[0][0]).toBe('/api/catalog/addons')
  expect(JSON.parse(String(vi.mocked(request).mock.calls[0][1]?.body))).toMatchObject({
    name: 'Tocineta extra', pricePesos: 5000,
    recipe: [{ ingredientId: 'i1', quantity: 30 }]
  })
  await waitFor(() => expect(onChanged).toHaveBeenCalled())
})
```

En `CatalogScreen.test.tsx`:

```tsx
it('abre la subseccion de adicionales desde el catalogo', async () => {
  mockAdminSnapshot({ products: [], categories: [], addons: [], ingredients: [] })
  render(<CatalogScreen database={await db()} />)
  await userEvent.click(await screen.findByRole('button', { name: /^adicionales$/i }))
  expect(screen.getByText(/nombre del adicional/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Correr la prueba y ver el fallo**

Run: `cd frontend && npx vitest run src/modules/admin/AddonsPanel.test.tsx src/modules/admin/CatalogScreen.test.tsx`
Expected: FAIL porque el componente no existe y la subsección sigue vacía.

- [ ] **Step 3: Implementar**

- Formulario de creación con `Nombre del adicional`, `Precio` y `RecipeEditor`.
- Lista con nombre, precio, receta y estado; botón `Editar`.
- Edición con nombre, precio, activo y receta; `PUT /api/catalog/addons/{id}`.
- Si no hay ingredientes, muestra `Crea primero un ingrediente en la pestaña Ingredientes` y no permite guardar receta.
- `CatalogScreen` reemplaza `ModifierGroupPanel` por `AddonsPanel`.

- [ ] **Step 4: Correr la prueba y verla pasar**

Run: `cd frontend && npx vitest run src/modules/admin/AddonsPanel.test.tsx src/modules/admin/CatalogScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/admin/AddonsPanel.tsx frontend/src/modules/admin/AddonsPanel.test.tsx frontend/src/modules/admin/CatalogScreen.tsx frontend/src/modules/admin/CatalogScreen.test.tsx
git rm frontend/src/modules/admin/ModifierGroupPanel.tsx frontend/src/modules/admin/ModifierGroupPanel.test.tsx
git commit -m "feat: administracion de adicionales con receta"
```

---

### Task 13: Panel de ingredientes

**Files:**
- Create: `frontend/src/modules/admin/IngredientsPanel.tsx`
- Test: `frontend/src/modules/admin/IngredientsPanel.test.tsx`
- Modify: `frontend/src/modules/admin/CatalogScreen.tsx`
- Test: `frontend/src/modules/admin/CatalogScreen.test.tsx`

**Interfaces:**
- Produces: `IngredientsPanel({ ingredients, onChanged })`.
- Consumes: `POST/PUT /api/catalog/ingredients`.

- [ ] **Step 1: Escribir la prueba que falla**

```tsx
it('crea un ingrediente en gramos con merma', async () => {
  vi.mocked(request).mockResolvedValue({} as never)
  const onChanged = vi.fn().mockResolvedValue(undefined)
  render(<IngredientsPanel ingredients={[]} onChanged={onChanged} />)

  await userEvent.type(screen.getByLabelText(/nombre del ingrediente/i), 'Tocineta')
  await userEvent.selectOptions(screen.getByLabelText(/unidad/i), 'GRAM')
  await userEvent.type(screen.getByLabelText(/merma/i), '5')
  await userEvent.click(screen.getByRole('button', { name: /crear ingrediente/i }))

  expect(JSON.parse(String(vi.mocked(request).mock.calls[0][1]?.body))).toMatchObject({
    name: 'Tocineta', unit: 'GRAM', wastePercent: 5
  })
  await waitFor(() => expect(onChanged).toHaveBeenCalled())
})
```

En `CatalogScreen.test.tsx`:

```tsx
it('abre la subseccion de ingredientes desde el catalogo', async () => {
  mockAdminSnapshot({ products: [], categories: [], addons: [], ingredients: [] })
  render(<CatalogScreen database={await db()} />)
  await userEvent.click(await screen.findByRole('button', { name: /^ingredientes$/i }))
  expect(screen.getByText(/nombre del ingrediente/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Correr la prueba y ver el fallo**

Run: `cd frontend && npx vitest run src/modules/admin/IngredientsPanel.test.tsx src/modules/admin/CatalogScreen.test.tsx`
Expected: FAIL porque el componente no existe.

- [ ] **Step 3: Implementar**

- Formulario con `Nombre del ingrediente`, `Unidad` (`Unidad`/`Gramo`), `Merma (%)` y botón `Crear ingrediente`.
- Lista con nombre, unidad, merma y estado; edición con nombre, unidad, merma y activo.
- `CatalogScreen` monta el panel en la subsección Ingredientes.

- [ ] **Step 4: Correr la prueba y verla pasar**

Run: `cd frontend && npx vitest run src/modules/admin/IngredientsPanel.test.tsx src/modules/admin/CatalogScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/admin/IngredientsPanel.tsx frontend/src/modules/admin/IngredientsPanel.test.tsx frontend/src/modules/admin/CatalogScreen.tsx frontend/src/modules/admin/CatalogScreen.test.tsx
git commit -m "feat: administracion de ingredientes"
```

---

### Task 14: Reporte de ingredientes en pantalla

**Files:**
- Modify: `frontend/src/application/use-cases/reports/local-summary.ts`
- Test: `frontend/src/application/use-cases/reports/local-summary.test.ts`
- Modify: `frontend/src/modules/reports/ReportsScreen.tsx`
- Test: `frontend/src/modules/reports/ReportsScreen.test.tsx`

**Interfaces:**
- Produces: `LocalSummary.byIngredient?` y `LocalSummary.recipeCoveragePercent?`.
- Consumes: `Summary` de Tarea 5.

- [ ] **Step 1: Escribir las pruebas que fallan**

```tsx
it('muestra el consumo de ingredientes y advierte cobertura baja', async () => {
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  vi.mocked(request).mockResolvedValue({
    expensesPesos: 0,
    byIngredient: [{ name: 'Carne', unit: 'UNIT', quantity: 42, wastePercent: 5 }],
    recipeCoveragePercent: 62.5
  } as never)

  render(<ReportsScreen />)

  expect(await screen.findByText(/consumo de ingredientes/i)).toBeInTheDocument()
  expect(screen.getByText(/42 unidad/i)).toBeInTheDocument()
  expect(screen.getByText(/62\.5 %/i)).toBeInTheDocument()
  expect(screen.getByText(/reporte es incompleto/i)).toBeInTheDocument()
})
```

En `local-summary.test.ts`, verificar que `dailySummary` conserva `byIngredient` y `recipeCoveragePercent` del servidor.

- [ ] **Step 2: Correr las pruebas y ver el fallo**

Run: `cd frontend && npx vitest run src/modules/reports/ReportsScreen.test.tsx src/application/use-cases/reports/local-summary.test.ts`
Expected: FAIL porque el reporte no muestra ingredientes.

- [ ] **Step 3: Implementar**

- Extender el tipo de `loadRemoteExpenses` en `dailySummary` para aceptar `byIngredient` y `recipeCoveragePercent`, y conservarlos en el resultado.
- `ReportsScreen` muestra `Consumo de ingredientes` con `nombre`, `quantity` y `unit` (`Unidad`/`g`) y `Cobertura de recetas`.
- Si `recipeCoveragePercent < 80`, muestra `El reporte es incompleto: faltan recetas por configurar` en color ámbar.
- Si no hay ingredientes, no renderiza la sección.

- [ ] **Step 4: Correr las pruebas y verlas pasar**

Run: `cd frontend && npx vitest run src/modules/reports/ReportsScreen.test.tsx src/application/use-cases/reports/local-summary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/application/use-cases/reports/local-summary.ts frontend/src/application/use-cases/reports/local-summary.test.ts frontend/src/modules/reports/ReportsScreen.tsx frontend/src/modules/reports/ReportsScreen.test.tsx
git commit -m "feat: consumo de ingredientes en reportes"
```

---

### Task 15: Verificación completa y documentación

**Files:**
- Modify: `docs/estado.md`
- Modify: `docs/endpoints.md`
- Modify: `docs/superpowers/specs/2026-11-11-admin-catalogo-design.md` solo si la implementación revela un cambio aprobado.

**Interfaces:**
- Consumes: todas las tareas anteriores.

- [ ] **Step 1: Actualizar documentación**

En `docs/endpoints.md`, agregar los ejemplos de `POST/PUT /api/catalog/addons`, `/ingredients` y los campos nuevos de productos. En `docs/estado.md`, registrar la iteración, las migraciones `026`, `027`, `028`, el comando de verificación y el pendiente de prueba manual con datos reales.

- [ ] **Step 2: Correr backend completo**

Run: `cd backend && ./mvnw verify`
Expected: BUILD SUCCESS, 0 fallos.

- [ ] **Step 3: Correr frontend completo y build**

Run: `cd frontend && npm test`
Expected: todas las pruebas pasan.

Run: `cd frontend && npm run build`
Expected: build correcto.

- [ ] **Step 4: Verificación manual mínima**

Con `make up` y la app levantada:

1. Administración › Catálogo › Ingredientes: crear `Carne` en `Unidad` y `Tocineta` en `Gramo` con 5 % de merma.
2. Adicionales: crear `Tocineta` a $5.000 con 30 g de receta y asignarlo a `SENCILLA`.
3. Productos: editar `SENCILLA`, marcar lunes a jueves y poner precio especial del lunes.
4. Combos: crear `COMBO VOZ Y YO` con 2 `SENCILLA` y 1 `PAPAS A LA FRANCESA`, con precio distinto de lunes a jueves.
5. Venta: agregar `SENCILLA` con 2 tocinetas y verificar total; agregar el combo y verificar que cobra su precio, no la suma de componentes.
6. Reportes: confirmar que aparece `Consumo de ingredientes` y la cobertura.

- [ ] **Step 5: Commit**

```bash
git add docs
git commit -m "docs: administracion del catalogo y consumo de ingredientes"
```

---

## Self-Review

- **Cobertura del spec:** adicionales (Tareas 1–4, 6–12), días (7, 10), precios por día (3, 6, 7, 9–11), combos (3, 11), ingredientes/recetas (1–5, 8–10, 12–14), compatibilidad (4, 8) y documentación (15).
- **Tipos consistentes:** `addons`/`addonId`, `SaleAddonRow`, `dayPrices`, `recipe`, `components` se usan con los mismos nombres en backend, frontend y pruebas.
- **Pruebas de riesgo:** cola vieja (Tarea 4), precio del día (7, 9), cantidad de adicional (8, 9), doble conteo de combos/devueltas (5), migración duplicada (1).
- **Límite conocido:** la migración se prueba con invariantes sobre el seed; si datos reales traen nombres duplicados, revisar el resultado de `addons` antes de desplegar.
