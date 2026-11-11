# Administración del catálogo: adicionales, días, combos e ingredientes — Diseño

**Fecha:** 2026-11-11
**Estado:** propuesto para aprobación.
**Contexto:** `Panteamiento del proyecto.md`, `docs/superpowers/specs/2026-11-06-modelo-datos-design.md`, `docs/superpowers/specs/2026-11-09-mejoras-operacion-design.md`, catálogo actual (`CatalogService`, `CatalogScreen`, `SaleScreen`).

---

## 1. Intención y por qué

La pestaña de Administración hoy permite crear un producto y editar nombre, precio, costo y días, pero no representa cómo trabaja el negocio:

- Los **adicionales** reales son cosas como tocineta, queso, maduro o maíz. Hoy están metidos en “grupos de modificadores” con mínimo y máximo, y en administración solo se puede cambiar el nombre del grupo; sus opciones no se editan.
- Los **días de venta** se escriben como `1,2,3,4`, lo que obliga a recordar la numeración.
- Los **combos** no se pueden crear ni editar desde la interfaz; su composición solo existe por seed.
- Un combo no puede tener **precio distinto según el día** (por ejemplo, “Voz y Yo” de lunes a jueves).
- No se puede saber **cuánta carne, tocineta o maduro** salió de las ventas, porque no existen recetas ni ingredientes.

Esta entrega convierte Administración en el lugar donde se mantiene el menú real, sin tocar la operación offline de la caja.

## 2. Objetivos

- Catálogo plano y reutilizable de **adicionales**, asignables por producto, con cantidad en la venta.
- Edición completa de **adicionales**: nombre, precio, estado y receta.
- **Días de venta** con selección visual y sin numeración manual.
- **Precio por día** sobre el mismo producto, con el precio base como valor por defecto.
- Crear y editar **combos** con sus componentes y cantidades.
- Catálogo de **ingredientes** y receta de una línea por producto y por adicional.
- Reporte de **consumo teórico** por ingrediente y **cobertura de recetas**.

## 3. No objetivos

- Inventario, stock, compras, proveedores, costo promedio ni alertas de reposición.
- Mermas por evento. Solo existe un porcentaje de merma declarado por ingrediente.
- Recetas multinivel o conversión de unidades.
- Adicionales fijos dentro de la composición de un combo. Esta entrega compone combos solo con productos vendibles.
- Editar el tipo (`PRODUCT`/`COMBO`) de un producto ya creado.
- Borrar productos, adicionales, ingredientes o categorías. Se desactivan.

## 4. Anti-goals

- Crear un producto nuevo por cada día o por cada precio promocional.
- Guardar el consumo de ingredientes como si fuera dato exacto cuando faltan recetas.
- Duplicar el nombre y el precio de un adicional dentro de cada producto.
- Romper ventas locales que ya están en la cola de sincronización o comprobantes históricos.

## 5. Restricciones

- Dinero en `bigint` y sufijo `_pesos`. Las cantidades de ingredientes usan `numeric(12,3)`.
- Toda tabla operativa conserva `tenant_id` y `location_id`; las FKs nuevas son compuestas.
- El servidor deriva tenant y sede del token.
- La caja sigue funcionando sin conexión con el catálogo sincronizado.
- Los nombres y precios de ventas pasadas no se reescriben.
- El endpoint público del catálogo debe seguir sirviendo a versiones anteriores de la PWA que aún tengan operaciones pendientes.
- La regla de día usa `America/Bogota`, 1 = lunes … 7 = domingo.

## 6. Enfoques considerados

### A. Evolucionar las tablas de modificadores

Reutilizar `modifier_groups`/`modifiers` como catálogo plano, agregar la relación producto↔adicional y cantidad en la venta.

**Por qué no:** el grupo con mínimo/máximo no representa nada del negocio nuevo. Obliga a un grupo oculto, deja nombres mentirosos y vuelve a estorbar cuando aparezcan categorías de adicionales o combos con extras.

### B. Modelo nuevo de adicionales *(elegido)*

Crear `addons`, `product_addons` y `sale_item_addons`. Las tablas viejas de modificadores quedan congeladas para el historial y para clientes antiguos. El nuevo catálogo no depende de grupos ni de reglas de selección.

**Por qué:** el dominio queda alineado con el negocio, el adicional es global y reutilizable, la cantidad es explícita y las recetas se cuelgan del adicional sin duplicarlas por producto. La migración es acotada y conserva todo lo histórico.

### C. Solo interfaz

Arreglar los formularios sin cambiar el modelo.

**Por qué no:** no resuelve precio por día ni consumo por ingrediente, y mantiene el modelo de grupos que el negocio no usa.

## 7. Modelo de datos

### 7.1 `addons`

Catálogo global de adicionales por sede.

- `id uuid pk`
- `tenant_id uuid fk tenants`
- `location_id uuid fk locations`
- `name varchar(100) not null`, no vacío
- `price_pesos bigint not null default 0 check >= 0`
- `active boolean not null default true`
- `created_at`, `updated_at`
- `unique(location_id, name)`
- `unique(id, tenant_id, location_id)` para FKs compuestas

### 7.2 `product_addons`

Qué adicionales permite cada producto.

- `product_id`, `addon_id`, `tenant_id`, `location_id`
- `primary key(product_id, addon_id)`
- FKs compuestas a `products` y `addons`
- índice por `addon_id`

### 7.3 `product_day_prices`

Precio especial por día para un producto o combo. Si no hay fila para un día, rige `products.price_pesos`.

- `product_id`, `weekday smallint not null check between 1 and 7`
- `price_pesos bigint not null check >= 0`
- `tenant_id`, `location_id`
- `primary key(product_id, weekday)`
- FK compuesta a `products`
- índice por `(tenant_id, location_id, product_id)`

### 7.4 `ingredients`

- `id uuid pk`
- `tenant_id`, `location_id`
- `name varchar(100) not null`, no vacío
- `unit ingredient_unit not null` (`UNIT` o `GRAM`)
- `waste_percent numeric(5,2) not null default 0 check between 0 and 100`
- `active boolean not null default true`
- `created_at`, `updated_at`
- `unique(location_id, name)`
- `unique(id, tenant_id, location_id)`

### 7.5 `recipe_items`

Receta de una línea. El dueño es un producto **o** un adicional, nunca ambos. Los combos no llevan receta propia: se explican por sus componentes.

- `id uuid pk`
- `tenant_id`, `location_id`
- `product_id uuid null`
- `addon_id uuid null`
- `ingredient_id uuid not null`
- `quantity numeric(12,3) not null check > 0`
- `check ((product_id is not null) <> (addon_id is not null))`
- FKs compuestas a `products`, `addons` e `ingredients`
- índices únicos parciales: `(product_id, ingredient_id)` y `(addon_id, ingredient_id)`

### 7.6 `sale_item_addons`

Congela los adicionales de una línea vendida, igual que `sale_item_modifiers` congela los modificadores históricos.

- `sale_item_id`, `addon_id`
- `addon_name varchar(100) not null`
- `additional_price_pesos bigint not null check >= 0`
- `quantity int not null check between 1 and 99`
- `tenant_id`, `location_id`
- `primary key(sale_item_id, addon_id)`
- FKs compuestas a `sale_items` y `addons`
- índice por `addon_id`

### 7.7 `combo_components`

Se conserva la tabla actual. La aplicación pasa a administrarla; no cambia su estructura.

## 8. Contratos de la API

### 8.1 Snapshot

`GET /api/catalog` y `GET /api/catalog/admin` agregan:

```json
{
  "version": 12,
  "categories": [],
  "products": [
    {
      "id": "...",
      "kind": "PRODUCT",
      "pricePesos": 16500,
      "saleDays": [1, 2, 3, 4],
      "addonIds": ["..."],
      "dayPrices": [{ "weekday": 1, "pricePesos": 15000 }],
      "recipe": [{ "ingredientId": "...", "quantity": 120 }],
      "components": []
    }
  ],
  "addons": [
    {
      "id": "...",
      "name": "Tocineta",
      "pricePesos": 5000,
      "active": true,
      "recipe": [{ "ingredientId": "...", "quantity": 30 }]
    }
  ],
  "ingredients": [
    { "id": "...", "name": "Tocineta", "unit": "GRAM", "wastePercent": 5, "active": true }
  ],
  "modifierGroups": []
}
```

- `modifierGroups` y `product.modifierGroupIds` se siguen enviando desde las tablas viejas para clientes anteriores. El frontend nuevo los ignora.
- `/api/catalog` devuelve solo activos. `/api/catalog/admin` devuelve activos e inactivos.

### 8.2 Adicionales

- `POST /api/catalog/addons` y `PUT /api/catalog/addons/{id}`
- Cuerpo: `{ "name": "Tocineta", "pricePesos": 5000, "active": true, "recipe": [{ "ingredientId": "...", "quantity": 30 }] }`
- Solo `ADMIN`. Sube `catalog_version`.

### 8.3 Ingredientes

- `POST /api/catalog/ingredients` y `PUT /api/catalog/ingredients/{id}`
- Cuerpo: `{ "name": "Tocineta", "unit": "GRAM", "wastePercent": 5, "active": true }`
- Solo `ADMIN`. Sube `catalog_version`.

### 8.4 Productos y combos

`POST /api/catalog/products` y `PUT /api/catalog/products/{id}` aceptan además:

```json
{
  "kind": "COMBO",
  "addonIds": ["..."],
  "dayPrices": [{ "weekday": 1, "pricePesos": 30000 }],
  "recipe": [{ "ingredientId": "...", "quantity": 120 }],
  "components": [{ "productId": "...", "quantity": 2 }]
}
```

Reglas:

- `kind` solo se usa al crear. En actualización el tipo no cambia.
- `addonIds` aplica igual a productos y combos.
- Un combo exige al menos un componente y no puede incluirse a sí mismo ni a otro combo.
- Un producto `PRODUCT` puede tener receta; un `COMBO` no. La receta del combo se deriva de sus componentes.
- `addonIds`, `dayPrices`, `recipe` y `components` reemplazan el conjunto completo cuando vienen. `null` significa “no cambiar”.
- Días repetidos, precios negativos, cantidades no positivas o referencias de otra sede devuelven `400`.
- El nombre repetido en la sede devuelve `409`.

## 9. Venta y precios

- `effectivePrice(product, now) = dayPrices[weekday] ?? pricePesos`, con `weekday` de Bogotá.
- La tarjeta del producto y `catalogUnitPricePesos` usan el precio efectivo del día.
- El cajero elige adicionales con cantidad (`1+`). No hay mínimo ni máximo por grupo.
- `lineTotalPesos = quantity × (unitPricePesos + Σ additionalPricePesos × addonQuantity)`.
- El adicional se cobra por unidad de línea, igual que el modificador histórico.
- El payload nuevo de sincronización envía `addons: [{ addonId, addonName, additionalPricePesos, quantity }]`.
- Si el payload no trae `addons`, el servidor sigue leyendo `modifiers` y los guarda en `sale_item_modifiers`, para no perder operaciones pendientes de versiones anteriores.
- El comprobante muestra `2 × Tocineta $10.000` cuando la cantidad es mayor que uno.

## 10. Administración

La pestaña **Catálogo** se divide en subsecciones, sin sumar pestañas al menú principal:

`Productos · Combos · Adicionales · Ingredientes · Categorías`

- **Productos:** tabla con búsqueda y filtro por categoría; columnas Producto, Categoría, Precio, Días, Adicionales, Estado. Botón `Nuevo producto`.
- **Combos:** misma tabla filtrada a combos; botón `Nuevo combo`.
- **Formulario de producto:** datos, días como botones seleccionables (L M X J V S D) con atajos `Todos`, `Lun-Jue` y `Vie-Dom`, precios por día (vacío = precio base), adicionales permitidos y receta.
- **Formulario de combo:** datos, días, precios por día, adicionales permitidos y composición (producto + cantidad, con búsqueda). No muestra receta.
- **Adicionales:** lista y formulario con nombre, precio, estado y receta. Reemplaza el panel de grupos de modificadores.
- **Ingredientes:** lista y formulario con nombre, unidad, merma y estado.
- **Categorías:** se conserva el panel actual.
- Todo guardado muestra estado de carga y confirmación o error. Las tablas anchas viven en un contenedor con scroll horizontal.
- Los controles usan etiquetas asociadas; los días son checkboxes reales, no solo color.

## 11. Reporte de consumo

`GET /api/reports/summary` agrega:

```json
{
  "byIngredient": [
    { "name": "Carne", "unit": "UNIT", "quantity": 42.0, "wastePercent": 5 }
  ],
  "recipeCoveragePercent": 82.5
}
```

- Consumo teórico del rango: líneas directas con receta, componentes de combos con receta y adicionales con receta.
- Un combo se explota con `sale_item_components`, es decir, la composición congelada al vender. Nunca se cuenta el combo y sus hijos a la vez. Las recetas que se aplican a esos componentes son las vigentes al consultar.
- Se excluyen ventas con estado `REFUNDED`.
- `quantity` ya incluye la merma: `consumo_neto × (1 + waste_percent / 100)`. `wastePercent` se devuelve solo para mostrarlo; la interfaz no vuelve a multiplicar.
- Cobertura: el denominador son las unidades de producto más las unidades de adicional seleccionadas. Una unidad de producto cuenta como cubierta si el producto tiene receta; si es combo, solo si **todos** sus componentes congelados tienen receta. Una unidad de adicional cuenta como cubierta si el adicional tiene receta. Si la cobertura es menor a 80 %, la interfaz muestra una advertencia de que el reporte es incompleto.
- En Reportes se muestra una sección `Consumo de ingredientes` solo cuando hay conexión y el servidor responde.

## 12. Migración y compatibilidad

Cambiosets nuevos:

1. `026-catalog-addons`: crea `addons`, `product_addons`, `sale_item_addons`.
   - Copia cada modificador actual a `addons` por sede. El de mayor precio conserva el nombre limpio; los demás del mismo nombre reciben el nombre del grupo como sufijo —por ejemplo `Queso` y `Queso (PAPAS)`— para no perder opciones ni cambiar lo que cobraba la caja. El administrador puede renombrarlos después.
   - Copia las asignaciones producto→grupo a `product_addons` usando las opciones del grupo.
   - Deja `modifier_groups`, `modifiers`, `product_modifier_groups` y `sale_item_modifiers` intactas.
2. `027-product-day-prices`: crea `product_day_prices`.
3. `028-ingredients-recipes`: crea el enum `ingredient_unit`, `ingredients` y `recipe_items`.

Compatibilidad:

- Clientes anteriores siguen recibiendo `modifierGroups`, `modifierGroupIds` y pueden seguir vendiendo con modificadores.
- La cola pendiente con `modifiers` sigue sincronizando.
- El frontend nuevo agrega la tabla local `addons` (versión 5 de Dexie) y usa `addonIds`; si un producto local viejo no trae `addonIds`, se trata como sin adicionales hasta la próxima sincronización.
- Las ventas locales históricas conservan su arreglo `modifiers`; la lectura acepta `addons ?? modifiers`.

## 13. Límites conocidos y decisiones del constructor

- El reporte de consumo es teórico y depende de que las recetas se mantengan. La cobertura visible es la defensa contra un dato engañoso.
- Cambiar una receta cambia el consumo histórico calculado. Si alguna vez se necesita consumo auditado, habrá que congelar la receta por venta.
- Los combos se componen solo de productos. Un adicional fijo dentro de la composición queda para una entrega posterior; un adicional suelto elegido al vender el combo sí se permite y se cobra aparte.
- Los precios por día se administran por día individual; “lunes a jueves” se logra marcando los cuatro días con el mismo valor.
- No se permite borrar catálogo: desactivar conserva historial y reportes.

## 14. Criterios de aceptación

1. Un administrador crea el adicional “Tocineta” con precio y receta, y lo asigna a una hamburguesa.
2. En Venta, esa hamburguesa permite elegir “2 × Tocineta” y el total refleja el doble del adicional.
3. Un producto con días `[1,2,3,4]` solo aparece de lunes a jueves; el formulario permite marcarlos con botones.
4. “Combo Voz y Yo” se crea o edita con sus componentes y vale $X de lunes a jueves y $Y el resto de días.
5. Un combo se cobra a su precio propio, no a la suma de sus componentes.
6. El reporte muestra cuántas carnes, tocinetas y maduros se consumieron en el rango, con su unidad y el porcentaje de cobertura.
7. Una operación pendiente con `modifiers` de una versión anterior sincroniza sin error.
8. Las pruebas de backend, frontend y build quedan verdes.
