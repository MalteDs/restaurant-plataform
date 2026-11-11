# Menú editable y caja de turno real — Diseño (piloto mínimo)

**Fecha:** 2026-11-11
**Estado:** pendiente de aprobación.
**Contexto:** `docs/estado.md`, `docs/requisitos-v1.md`, `docs/superpowers/specs/2026-11-10-caja-operacion-design.md`.
**Plan:** se escribe después de aprobar este documento.

---

## 1. Intención

Reportes queda en pausa. El foco es que Almendros pueda operar un día real
sin que el desarrollador entre a la API ni al código: administrar el menú
desde Administración y cerrar la caja con confianza.

El menú ya se vende y la caja ya abre, mueve efectivo y cierra. Lo que falta
es que el menú sea editable de punta a punta y que el cajero tenga las dos
ayudas que hoy resuelve de memoria o con una calculadora: el vuelto y el
resumen del turno antes de cerrar.

## 2. Decisiones

| # | Decisión | Efecto |
|---|---|---|
| D-28 | El menú se administra desde Administración: productos, categorías y grupos de modificadores. | Producto: nombre, categoría, precio, costo, activo y días de venta. Categoría: nombre, orden y activo. Grupo: nombre, mínimo, máximo y opciones al crearlo; después solo nombre y activo. |
| D-29 | Administración lee un snapshot propio con inactivos; la caja sigue leyendo solo activos. | Se agrega `GET /api/catalog/admin` (solo ADMIN). El snapshot de sync no cambia, así que la venta nunca recibe productos inactivos. |
| D-30 | Se puede asignar y quitar grupos de modificadores a un producto. | Sin esto, crear un grupo no sirve. El alta y la edición de producto aceptan `modifierGroupIds`; lista vacía quita todos. |
| D-31 | Al guardar un cambio de menú, este dispositivo refresca su catálogo local. | Se llama `syncCatalog` después de guardar. Otros dispositivos siguen actualizando en el intervalo de 30 minutos; es un límite conocido del piloto. |
| D-32 | El pago en efectivo muestra el vuelto. | El campo "Efectivo recibido" es opcional. Si se escribe y no alcanza el total, no se cobra. No cambia el monto de la venta ni el arqueo. |
| D-33 | Antes de cerrar, el turno muestra su resumen y pide confirmación. | Ventas por medio, devoluciones por medio, ingresos, retiros, gastos de caja y efectivo esperado. Cerrar es irreversible: siempre se confirma. La nota por diferencia se mantiene. |
| D-34 | No se incluye conteo ciego, administración de componentes de combos ni edición de opciones de un grupo ya creado. | Quedan como mejoras posteriores. Los combos existentes se pueden editar en precio, días y disponibilidad, pero no en composición. |

## 3. Alternativas consideradas

- **A. Caja primero.** Vuelto, resumen y confirmación de cierre. Menos trabajo,
  pero el menú sigue dependiendo del desarrollador.
- **B. Menú primero.** CRUD de menú y refresco inmediato. La caja ya opera,
  pero el cajero sigue calculando el vuelto a mano y cerrando sin resumen.
- **C. Piloto mínimo (elegida).** A + B en una iteración corta. Es la única que
  deja la sede autosuficiente para un turno real.

Se descartó construir multi-sede y reportes: no hay validación con el dueño y
Calipso no captura ventas de plataforma, así que un consolidado sería falso.

## 4. Decisiones de interfaz

Basadas en `ui-ux-pro-max` (búsquedas de tablas administrativas, confirmación
de acciones irreversibles, validación de formularios, estados vacíos y tablas
responsivas):

- **Paneles inline, no modales, para crear y editar.** Se reutiliza el patrón
  de `CashMovementPanel`. Evita trampas de foco y mantiene el contexto de la
  tabla.
- **Búsqueda con `useDeferredValue`.** No se filtra en cada tecla. Filtro por
  nombre y por categoría; estado vacío con acción para limpiar filtros.
- **Inactivos visibles con etiqueta.** No se ocultan: se muestran con un badge
  "Inactivo" y un botón para reactivar.
- **Errores con `role="alert"` y éxito con `role="status"`.** Nada de éxito
  silencioso. El botón muestra "Guardando…" mientras envía.
- **Tabla con scroll horizontal en pantallas angostas.** Las columnas menos
  importantes se ocultan en móvil; las acciones quedan siempre visibles.
- **Confirmación nativa para cerrar turno.** `window.confirm` es accesible y
  consistente con la anulación de movimientos que ya existe.
- **Vuelto y faltante con texto, no solo color.** "Vuelto $3.500" en verde o
  "Faltan $6.500" en ámbar.
- **Sin dependencias nuevas.** Se usan `Button`, `Card`, `Input` y Tailwind
  existentes.

## 5. Alcance

### 5.1 Dentro

- Listar productos activos e inactivos, buscar y filtrar por categoría.
- Crear producto y editar nombre, categoría, precio, costo, activo y días.
- Asignar y quitar grupos de modificadores a un producto.
- Crear y editar categorías (nombre, orden, activo).
- Crear grupos de modificadores con sus opciones; editar nombre y activo.
- Refrescar el catálogo local al guardar.
- Mostrar vuelto en pago único en efectivo.
- Mostrar resumen del turno antes del cierre.
- Confirmar el cierre y mantener la nota obligatoria por diferencia.
- Actualizar pruebas, documentación y un E2E del flujo.

### 5.2 Fuera

- Administrar componentes de combos.
- Agregar o quitar opciones de un grupo ya creado.
- Conteo ciego de efectivo.
- Reportes, consolidación multi-sede y permisos de dueño multi-sede.
- Historial central de turnos de otras cajas.
- Impresión de tirillas (ya existe y no se toca).

## 6. Límites conocidos

- Otros dispositivos ven los cambios de menú hasta 30 minutos después. Solo el
  dispositivo que guarda refresca de inmediato.
- Un costo ya guardado no se puede borrar a `null` con el endpoint actual;
  escribir `0` lo deja en cero. Se documenta en la interfaz.
- Los combos se crean por seed; desde la interfaz solo se editan precio, días y
  disponibilidad.
- El resumen del turno usa las ventas locales del dispositivo, igual que el
  arqueo. No consolida otras cajas.

## 7. Criterios de aceptación

- Un ADMIN crea un producto, lo ve en Venta en el mismo dispositivo y puede
  desactivarlo y reactivarlo.
- Un ADMIN crea una categoría y un grupo de modificadores, asigna el grupo a un
  producto, y la venta muestra las opciones.
- El cajero escribe el efectivo recibido y ve el vuelto; si el efectivo no
  alcanza, el cobro se bloquea con un mensaje claro.
- Antes de cerrar, el cajero ve ventas por medio, devoluciones, movimientos y
  gastos. El cierre pide confirmación; una diferencia sigue exigiendo nota.
- `./mvnw verify` y `npm test` pasan; el E2E del flujo pasa.
