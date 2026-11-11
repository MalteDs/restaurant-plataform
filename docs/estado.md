# Estado de implementación — Caja v1

**Última actualización:** 2026-11-11
**Fase:** v1 + mejoras de operación + impresión de comprobante + detalle de pedidos + operación de caja + accesibilidad del lote 1 + menú editable y caja de turno real implementados; prueba física pendiente.
**Tarea en curso:** ninguna.
**Último commit de implementación:** ver `git log -1` (menú, caja y accesibilidad).
**Modelo de datos:** `docs/superpowers/specs/2026-11-06-modelo-datos-design.md` (aprobado 2026-11-06) + `docs/superpowers/specs/2026-11-09-mejoras-operacion-design.md`.
**Bloqueos:** ninguno.

## Progreso

- [x] Tarea 1 — Monolito modular, PostgreSQL y salud
- [x] Tarea 2 — Esquema multi-tenant, auditoría y dinero
- [x] Tarea 3 — Identidad, dispositivos y autenticación
- [x] Tarea 4 — Catálogo
- [x] Tarea 5 — Ventas, turnos y pedidos en el servidor
- [x] Tarea 6 — Sync API idempotente
- [x] Tarea 7 — Reportes centrales, gastos y auditoría
- [x] Tarea 8 — Shell PWA, service worker y navegación
- [x] Tarea 9 — Base local, catálogo y sesión offline
- [x] Tarea 10 — Venta offline con carrito y pago
- [x] Tarea 11 — Motor de sincronización
- [x] Tarea 12 — Cierre de turno, reportes locales y CSV
- [x] Tarea 13 — Devoluciones, gastos y administración
- [x] Tarea 14 — Recuperación: exportar y restaurar pendientes
- [x] Tarea 15 — E2E offline, despliegue y documentación

## Mejoras de operación (2026-11-09)

- [x] Tarea 1 — Días de venta en el catálogo (backend)
- [x] Tarea 2 — Días de venta en la caja y el admin (frontend)
- [x] Tarea 3 — Cambio de precio autorizado con auditoría (backend)
- [x] Tarea 4 — Cambio de precio por línea en la caja (frontend)
- [x] Tarea 5 — Pagos combinados (backend)
- [x] Tarea 6 — Pagos combinados y medio de devolución (frontend)
- [x] Tarea 7 — Categorías de gasto y reporte (backend)
- [x] Tarea 8 — Categorías de gasto en la interfaz (frontend)
- [x] Tarea 9 — Verificación de extremo a extremo y documentación

### Verificación

- Backend: `./mvnw verify` → 52 pruebas, 0 fallos.
- Frontend: `npm test` → 56 pruebas, 0 fallos; `npm run build` correcto.
- E2E: `npx playwright test e2e/improvements.spec.ts` → 4 escenarios, incluido pago dividido con arqueo solo de efectivo.
- Migraciones nuevas: `021-catalog-sale-days`, `022-price-override`, `023-split-payments`, `024-expense-categories`.

### Notas de la iteración

- Promociones: `products.sale_days` con días ISO 1–7. Fuera del día el producto no aparece en Venta. No se sembraron precios de promoción porque el usuario aún no confirmó la lista completa; el Admin los define en el catálogo.
- Cambio de precio: solo MANAGER/ADMIN, por línea, motivo de 5–200 caracteres y evento `PRICE_OVERRIDDEN`. El servidor revalida rol y motivo al sincronizar; la validación se ejecuta también en `SyncService.validate` para que un rechazo no marque rollback-only la transacción del lote.
- Pagos combinados: `payments` es una lista; la suma debe coincidir con el total. Operaciones antiguas con `method` siguen sincronizando como un pago único. El efectivo esperado del turno suma solo `p.amount_pesos` de pagos `CASH`.
- Devoluciones: totales y con un medio elegido por el usuario; una venta con pago mixto no replica automáticamente la distribución al devolver.
- Gastos: categorías por sede administradas por Admin, con seed Domicilios/Fruver/Insumos/Aseo/Servicios/Otros. El reporte agrupa por el texto congelado del gasto; renombrar la categoría no reescribe el histórico.
- Compatibilidad: el endpoint de gastos conserva `category` como texto legado para clientes viejos; la UI nueva envía `expenseCategoryId`.
- Reportes del día: la pantalla usa las ventas locales de este dispositivo y completa gastos y desglose de gastos desde el servidor. La agregación en línea de varios dispositivos no forma parte de esta iteración.
- Pendiente previo que sigue abierto: el alta de productos/combos desde la interfaz no existe; los nuevos se crean por la API documentada. Los combos promocionales se pueden editar en Catálogo.

## Impresión de comprobante (2026-11-10)

- [x] Tarea 1 — Datos y HTML del comprobante
- [x] Tarea 2 — Impresión automática y botón en Venta
- [x] Tarea 3 — Reimpresión desde Pedidos
- [x] Tarea 4 — Verificación automatizada y documentación
- [ ] Prueba manual en la impresora térmica del local

### Verificación

- Frontend: `npm test` → 142 pruebas, 0 fallos.
- `npm run build` correcto.
- E2E no aplica: el diálogo de impresión del navegador no se automatiza.

### Notas de la iteración

- La impresión usa un iframe oculto y `window.print()`: sin dependencias nuevas ni cambios de backend.
- Se imprime automáticamente al cobrar y queda el botón `Imprimir comprobante`; también se reimprime desde Pedidos.
- Si falla la apertura de impresión, la venta queda guardada y se muestra `No se pudo imprimir. La venta quedó guardada.`. El navegador no confirma si el papel salió; por eso el panel siempre recuerda que se puede reimprimir.
- El comprobante muestra el medio de pago y, cuando el cajero registra efectivo recibido, también `Recibido` y `Cambio`. El dato se guarda en la venta para que salga igual al reimprimir.
- El comprobante es interno: dice `Comprobante de venta`, sin NIT ni datos DIAN.
- El ancho es fluido para 58 u 80 mm. Falta probarlo en la térmica real; si el texto se corta, ajustar el CSS de `receipt.ts`.
- Pendiente manual: identificar el modelo de la impresora y registrar el resultado de la prueba física.

## Pedidos: detalle y devolución segura (2026-11-10)

- [x] Tarea 1 — Motivo de devolución de 5 a 200 caracteres en el caso de uso local
- [x] Tarea 2 — Misma validación en backend y sincronización
- [x] Tarea 3 — Panel de detalle con reimpresión y devolución segura
- [x] Tarea 4 — Filtros por día, estado y código, resumen y paginación
- [x] Tarea 5 — Documentación y verificación completa

### Verificación

- Frontend: `npm test` → 91 pruebas, 0 fallos; `npm run build` correcto.
- Backend: `./mvnw verify` → pruebas sin fallos, incluida la nueva validación de motivo.
- Pruebas nuevas: helper de filtros, detalle con ítems/modificadores/pagos, devolución solo desde el detalle, motivo corto rechazado y paginación de 50.

### Notas de la iteración

- La lista de Pedidos abre el detalle al tocar cualquier fila; **Imprimir comprobante** y **Devolver** viven en el detalle.
- La devolución es un segundo paso dentro del detalle: motivo de 5 a 200 caracteres, medio y confirmación.
- Filtros: **Hoy** por defecto, **7 días**, **Mes**, **Año**, **Todo** o rango **Desde/Hasta**, más estado y búsqueda por código; **Cargar más** de 50 en 50.
- La venta devuelta muestra monto, medio, motivo y fecha, y ya no permite devolver otra vez.
- Sin cambios de API ni dependencias nuevas; todo sigue offline con IndexedDB.

## Caja: movimientos, gastos y cierre (2026-11-10)

- [x] Tarea 1 — Esquema de caja y lectura de categorías
- [x] Tarea 2 — Movimiento de efectivo y gasto de caja
- [x] Tarea 3 — Corrección, anulación y reportes sin anulados
- [x] Tarea 4 — Cierre con denominaciones y nota
- [x] Tarea 5 — Esquema local y categorías sin conexión
- [x] Tarea 6 — Movimiento, edición y anulación en el cliente
- [x] Tarea 7 — Cierre por denominaciones y nota en el cliente
- [x] Tarea 8 — Resumen local y CSV de cierre
- [x] Tarea 9 — Pantalla de movimientos
- [x] Tarea 10 — Cierre, historial y exportación
- [x] Tarea 11 — E2E, documentación y verificación

### Verificación

- Backend: `./mvnw verify` → pruebas verdes, sin fallos.
- Frontend: `npm test` → 116 pruebas, 0 fallos; `npm run build` correcto.
- E2E: `e2e/cash-operations.spec.ts` y `e2e/offline.spec.ts` → 3 escenarios verdes.
- Migración nueva: `025-caja-operacion`.

### Notas de la iteración

- Cualquier usuario autenticado opera Caja. Reportes y el formulario de gastos por fuera siguen siendo Encargado/Admin. Es una decisión explícita para los días en que el encargado de la sede no está. La restricción se aplica también en la ruta y en el endpoint del resumen.
- La pantalla usa una sola acción **Registrar movimiento** con selector **Ingreso/Retiro** y casilla **Es gasto**; el resumen del turno muestra ingresos, retiros y gastos por separado.
- Un gasto de caja es un retiro con categoría obligatoria. Crea el movimiento y el gasto en la misma operación de sincronización; el arqueo lee movimientos y la utilidad lee gastos, sin sumar dos veces.
- Un movimiento se edita o anula solo con el turno abierto. La corrección no borra el histórico: anula el viejo con usuario y fecha y crea el nuevo. Un turno cerrado no se edita.
- El cierre cuenta por denominaciones; el total se calcula. Si hay diferencia, la nota es obligatoria. El servidor no rechaza el cierre porque su esperado difiera del local: guarda ambos y marca la diferencia.
- El CSV de cierre es local y reemplaza el Excel manual. El resumen diario y su exportación siguen en Reportes.
- Las categorías se siembran en el dispositivo y se actualizan desde el servidor cuando hay conexión.
- Límite conocido: el historial de turnos es del dispositivo. Ver turnos de otras cajas o sedes requiere un endpoint central y queda fuera.
- Decisión pendiente con los dueños: cómo consolidan gastos y cierres entre las tres sedes.

## Accesibilidad y foco visible — lote 1 (2026-11-11)

- [x] Tarea 1 — Contraste de marca y foco visible global
- [x] Tarea 2 — Modal compartido con foco atrapado y Escape
- [x] Tarea 3 — Errores anunciados con `role="alert"`
- [x] Tarea 4 — Salida al login desde la pantalla de bloqueo
- [x] Tarea 5 — Fila de Pedidos con acción accesible y semántica de tabla
- [x] Tarea 6 — Documentación y verificación

### Verificación

- Frontend: `npm test` → 31 archivos, 123 pruebas, 0 fallos; `npm run build` correcto.
- Contraste: `brand-600` `#c2410c` = 5.18:1 y `brand-700` `#9a3412` = 7.31:1 sobre blanco.
- Pruebas nuevas: `Modal` (foco, Escape, Tab), `FormError` (alert), recuperación en Bloqueo y semántica de tabla en Pedidos.

### Notas de la iteración

- Los modales de precio, presentación y modificadores ahora son diálogos accesibles y cierran con Escape.
- Los errores de formulario se anuncian; los paneles de Caja ya usaban `role="alert"` y se mantuvieron.
- La rama se basó en `feat/mejoras-venta` e incluye Pedidos. Los lotes 2 y 3 quedan pendientes.
- Sin cambios de backend ni dependencias nuevas.

## Menú editable y caja de turno real (2026-11-11)

- [x] Tarea 1 — Snapshot administrativo con inactivos
- [x] Tarea 2 — Asignación de grupos de modificadores a productos
- [x] Tarea 3 — Gestión de productos en Administración
- [x] Tarea 4 — Gestión de categorías
- [x] Tarea 5 — Gestión de grupos de modificadores
- [x] Tarea 6 — Vuelto en el cobro de efectivo
- [x] Tarea 7 — Resumen del turno y confirmación de cierre
- [x] Tarea 8 — E2E, documentación y verificación

### Verificación

- Backend: `./mvnw verify` → pruebas verdes.
- Frontend: `npm test` → pruebas verdes; `npm run build` correcto.
- E2E: `npx playwright test e2e/menu-cash-pilot.spec.ts` → 2 escenarios verdes.

### Notas de la iteración

- El menú se administra desde Administración: productos (nombre, categoría, precio, costo, activo y días), categorías y grupos de modificadores.
- `GET /api/catalog/admin` incluye inactivos y exige ADMIN. `GET /api/catalog` sigue devolviendo solo activos para la venta.
- Los productos aceptan `modifierGroupIds` al crearse o editarse. Lista vacía quita todos los grupos.
- Al guardar un cambio de menú, el dispositivo que guarda refresca su catálogo local. Otros dispositivos esperan al intervalo de 30 minutos.
- La caja muestra el vuelto del pago en efectivo y bloquea el cobro si el efectivo recibido no alcanza.
- Antes de cerrar, el turno muestra ventas por medio, devoluciones, ingresos, retiros, gastos y efectivo esperado. El cierre siempre pide confirmación.
- Límites conocidos: los componentes de combos y las opciones de un grupo ya creado no se editan desde la interfaz; un costo guardado no se puede volver a `null`, solo a `0`; el resumen del turno es del dispositivo.

## Notas de la sesión

- Tarea 1 revisada y aprobada por `opencode-go/deepseek-v4.1-flash`, modelo liviano elegido explícitamente por el usuario.
- `./mvnw test -Dtest=HealthIT` y `./mvnw verify`: 1 prueba, 0 fallos, 0 errores y sin advertencias.
- La prueba de salud verifica el estado agregado y `components.db.status = UP`; su aserción adicional tuvo RED controlada y luego GREEN.
- `infra/docker-compose.yml` valida con `docker compose config`. Falta su smoke test de arranque porque `postgres-carga-docente` ocupa el puerto 5432; no se modificó ese servicio.
- Menores diferidos de revisión: detalles de salud con `show-details: always` y comentario explicativo para el override de Testcontainers.
- Modelo de datos relacional normalizado aprobado por el usuario: 23 tablas, dinero en `bigint`, FKs compuestas para aislar tenant y sede.
- Decisiones de negocio cerradas: modificadores por unidad, solo devoluciones completas y código de dispositivo nuevo al re-provisionar.
- El plan se ajustó al modelo aprobado: precios congelados desde la caja, `sale_item_components`, `refunds.shift_id` y `sync_operations.clock_skew`.
- Tarea 3: login/refresh con JWT (15 min) y refresh opaco rotado (30 días), BCrypt, registro y revocacion de dispositivos, filtros `JwtAuthFilter` y `DeviceTokenFilter`.
- Tarea 3: `JWT_SECRET` es obligatorio fuera del perfil `local`; el compose y la documentacion de despliegue deben definirlo.
- Tarea 4: catalogo con version, seed del menu de Karbon (9 categorias, 75 productos) y endpoints admin con validacion.
- Tarea 5: venta con precios congelados de la caja, pago unico, pedido 1:1, turno abierto por dispositivo y devolucion completa.
- Tarea 6: `POST /api/sync/operations` con `APPLIED|DUPLICATE|RETRY|REJECTED`, orden por `seq` y `payload_hash` para detectar cambios.
- Tarea 7: resumen de ventas, devoluciones, medios de pago, utilidad, gastos y auditoría; endpoints de reportes, gastos y auditoría con aislamiento por tenant y sede.
- Tarea 8: frontend React + Vite + Tailwind, rutas `/login`, `/sale`, `/orders`, `/cash`, `/reports`, `/admin`, navegación por rol, `api.request` y service worker con precache (no intercepta `/api/**`).
- Comandos frontend: `cd frontend && npm run test`, `npm run build`, `npx playwright test e2e/shell.spec.ts`.
- Tarea 9: Dexie con stores de catálogo, ventas, turnos, movimientos, devoluciones, operaciones, meta y usuarios; `syncCatalog` idempotente por versión; PIN PBKDF2 y sesión offline de 7 días con pantalla `/lock`.
- Tarea 10: carrito offline con catálogo local, tipos mostrador/domicilio/mesa, pago único, modificadores por grupo y venta + operación `LOCAL_PENDING` en una sola transacción Dexie.
- Tarea 11: `pushPending` por lotes de 50 en orden de `seq`, backoff exponencial, disparadores online/visibilidad/30 s y estado visible `Pendientes | Sincronizando | Error | Al día | Sin conexión`.
- Tarea 12: apertura y cierre de turno offline con arqueo, cola `CLOSE_SHIFT`, resumen local con desglose por categoría/día/hora/producto y exportación CSV con `;` y UTF-8.
- Tarea 13: devoluciones offline con motivo, gastos solo online para MANAGER/ADMIN, pantallas de catálogo, usuarios, dispositivos y sede; endpoints admin de usuarios, dispositivos y sede en el backend.
- Tarea 14: exportación JSONL de operaciones y ventas pendientes, restauración idempotente por `operationId`, pantalla `/recovery` con doble confirmación y carpeta de respaldo (File System Access con fallback a descarga).
- Verificación automatizada: backend 47 pruebas, frontend 23 pruebas, E2E 3 escenarios (shell offline, venta/cierre/sync, recuperación en perfil limpio), respaldo/restauración con 75 productos.
- Revisión final aplicada: rechazos de sync persistentes, prefijo por dispositivo, recuperación con token/meta/turnos, costo por cantidad y sin devueltas, devolución atómica, refresh de token, catálogo periódico y fechas operativas del cliente.
- Pendiente manual (no bloqueante): 500 ventas offline en el PC real Windows 10 de 2 GB, midiendo memoria de Edge.
- Pendiente de decisión: la utilidad local offline no incluye gastos (no se guardan sin conexión); con red, Reportes usa el resumen del servidor.

## Administración del catálogo (2026-11-11)

- Adicionales globales por sede (`addons`), asignables a productos y combos, con cantidad 1+ en la venta y receta propia.
- Días de venta con selección visual y precio especial por día (`product_day_prices`); el precio base sigue en `products.price_pesos`.
- Combos editables con componentes y cantidades desde Administración.
- Ingredientes y recetas de una línea para productos y adicionales (`ingredients`, `recipe_items`).
- Reporte de consumo teórico con merma incluida y cobertura de recetas; advierte si la cobertura es menor al 80 %.
- Migraciones nuevas: `026-catalog-addons`, `027-product-day-prices`, `028-ingredients-recipes`.
- Compatibilidad: los payloads de sync con `modifiers` siguen funcionando; los grupos de modificadores quedan congelados para el historial y clientes anteriores.
- Verificación automatizada: backend `./mvnw verify` → 176 pruebas, 0 fallos; frontend `npm test` → 159 pruebas, 0 fallos; `npm run build` correcto.
- Pendiente manual: probar con datos reales el alta de adicionales, ingredientes, combo “Voz y Yo” con precio de lunes a jueves y el reporte de consumo. Revisar el resultado de `addons` si producción trae modificadores con nombres duplicados.

## Decisiones pendientes

- Proveedor de nube (sujeto a cambios; no bloquea hasta la Tarea 15).
- Costo por producto para utilidad exacta (opcional).
- PC de reemplazo (procedimiento documentado, sin hardware).
