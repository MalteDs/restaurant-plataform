# Requisitos y criterios de aceptación — Caja v1

**Estado:** borrador para aprobación. Base contractual de la implementación.
**Fecha:** 2026-11-05
**Contexto:** `Panteamiento del proyecto.md`
**Plan de implementación:** `docs/superpowers/plans/2026-11-05-caja-v1-pwa.md`

---

## 0. Convenciones

| Marca | Significado |
|---|---|
| **RF** | Requisito funcional. |
| **RNF** | Requisito no funcional. |
| **UI** | Requisito de interfaz. |
| **CA** | Criterio de aceptación verificable. |
| **Debe** | Obligatorio para v1. Si falta, v1 no se acepta. |
| **Debería** | Esperado; su ausencia se justifica y se registra. |
| **Puede** | Opcional. |

Un requisito sin criterio de aceptación no se considera completo.

---

## 1. Alcance

**Dentro de v1**

- Caja para el punto físico de Karbón, sede Almendros: mostrador, mesas y domicilio propio con envío.
- PWA offline-first: vender, devolver, abrir/cerrar turno y consultar el día sin Internet.
- Backend central en la nube con PostgreSQL como fuente de verdad consolidada.
- Sincronización idempotente y ordenada.
- Catálogo por sede, con categorías, modificadores y combos.
- Usuarios con roles, autenticación online y PIN offline.
- Reportes operativos y utilidad con gastos.
- Respaldos automáticos y recuperación de ventas pendientes.

**Fuera de v1**

- Facturación electrónica DIAN, impuestos y contabilidad formal.
- Inventario, compras, proveedores, nómina.
- Integración con Rappi, DiDi, datáfono o Bre-B.
- Impresión de tirillas.
- Propinas, descuentos y división de cuenta.
- Tablets, KDS, Task Engine, empaque y despacho (fase 2).
- Multisede activa y multi-restaurante operativo (el modelo lo soporta, la UI no).
- App móvil y mapa de mesas.

---

## 2. Actores y permisos

| Actor | Descripción |
|---|---|
| **Cajero** | Opera la caja: vende, devuelve y consulta sus ventas. |
| **Encargado** | Además: abre y cierra turno, registra movimientos y gastos, ve todos los reportes. |
| **Administrador** | Además: catálogo, usuarios, dispositivos, configuración y recuperación. |
| **Sistema** | Motor de sync, respaldos y auditoría. No es un usuario. |

| Acción | Cajero | Encargado | Admin |
|---|---|---|---|
| Vender | Sí | Sí | Sí |
| Devolver con motivo | Sí | Sí | Sí |
| Abrir y cerrar turno | No | Sí | Sí |
| Movimientos de caja | No | Sí | Sí |
| Registrar gastos | No | Sí | Sí |
| Reportes del día y utilidad | No | Sí | Sí |
| Catálogo | No | No | Sí |
| Usuarios y dispositivos | No | No | Sí |
| Respaldos y restauración | No | No | Sí |
| Configuración de sede | No | No | Sí |

`[Regla]` El servidor valida el rol en cada operación. Ocultar un botón no es un control de seguridad.

---

## 3. Requisitos funcionales

### 3.1 Autenticación y sesión

| ID | Requisito | Prioridad |
|---|---|---|
| RF-AUTH-01 | Iniciar sesión con usuario y contraseña cuando hay conexión. | Debe |
| RF-AUTH-02 | Desbloquear la caja sin conexión con un PIN local de 4–6 dígitos. | Debe |
| RF-AUTH-03 | La sesión offline expira a los 7 días; renovarla exige conexión. | Debe |
| RF-AUTH-04 | Cerrar sesión manualmente y bloquear la pantalla. | Debe |
| RF-AUTH-05 | Registrar un dispositivo desde un usuario administrador y emitir su token. | Debe |
| RF-AUTH-06 | Revocar un dispositivo; sus operaciones posteriores se rechazan. | Debe |
| RF-AUTH-07 | Cada operación sincronizada lleva el usuario que la ejecutó. | Debe |

**CA-AUTH**

| ID | Criterio |
|---|---|
| CA-AUTH-01 | Dado un usuario activo, cuando ingresa credenciales correctas, entonces recibe sesión y acceso según su rol. |
| CA-AUTH-02 | Dado un usuario activo, cuando ingresa contraseña incorrecta, entonces la respuesta es 401 y no se crea sesión. |
| CA-AUTH-03 | Dado un dispositivo sin red y una sesión cacheada vigente, cuando ingresa el PIN correcto, entonces puede vender. |
| CA-AUTH-04 | Dado un PIN incorrecto, entonces no se desbloquea y se registra el intento. |
| CA-AUTH-05 | Dada una sesión offline de más de 7 días, entonces exige conexión antes de vender. |
| CA-AUTH-06 | Dado un cajero, cuando intenta administrar catálogo, entonces el servidor responde 403. |
| CA-AUTH-07 | Dado un dispositivo revocado, cuando sincroniza, entonces recibe 401 y la cola queda retenida sin borrarse. |

### 3.2 Catálogo

| ID | Requisito | Prioridad |
|---|---|---|
| RF-CAT-01 | Mostrar categorías y productos de la sede, activos y ordenados. | Debe |
| RF-CAT-02 | Buscar producto por nombre sin distinguir mayúsculas ni tildes. | Debe |
| RF-CAT-03 | Soportar modificadores por grupos, con mínimo, máximo y precio adicional. | Debe |
| RF-CAT-04 | Soportar combos como producto vendible con componentes definidos. | Debe |
| RF-CAT-05 | Administrar productos: nombre, precio, costo opcional, categoría, disponibilidad. | Debe |
| RF-CAT-06 | Administrar categorías y grupos de modificadores. | Debe |
| RF-CAT-07 | Descargar el catálogo por versión y guardarlo completo y atómico. | Debe |
| RF-CAT-08 | Usar el catálogo local cuando no hay red. | Debe |
| RF-CAT-09 | Impedir precios negativos o productos sin nombre. | Debe |

**CA-CAT**

| ID | Criterio |
|---|---|
| CA-CAT-01 | Dado el catálogo de Karbón cargado, cuando el cajero abre venta, entonces ve las 9 categorías y sus productos. |
| CA-CAT-02 | Dado un producto desactivado, entonces no aparece en la pantalla de venta pero sí en el histórico. |
| CA-CAT-03 | Dado un producto con precio inválido, cuando se guarda, entonces el servidor responde 400. |
| CA-CAT-04 | Dado un cambio de precio en el servidor, cuando la caja sincroniza catálogo, entonces lo usa en ventas nuevas y no altera ventas anteriores. |
| CA-CAT-05 | Dado un combo, cuando se vende, entonces se registra como una línea con su precio y conserva sus componentes. |
| CA-CAT-06 | Dado un grupo de modificadores obligatorio, cuando no se elige una opción válida, entonces no se puede agregar la línea. |

### 3.3 Venta

| ID | Requisito | Prioridad |
|---|---|---|
| RF-SALE-01 | Registrar venta de mostrador, domicilio propio (con envío) o mesa con etiqueta libre. | Debe |
| RF-SALE-02 | Agregar, quitar y cambiar cantidades (1–99). | Debe |
| RF-SALE-03 | Aplicar modificadores y una nota por línea (≤ 200 caracteres). | Debe |
| RF-SALE-04 | Calcular el total en pesos, sin decimales. | Debe |
| RF-SALE-05 | Registrar un medio de pago: efectivo, tarjeta por datáfono o Bre-B por QR de Bold. | Debe |
| RF-SALE-06 | Confirmar la venta sin red, guardando venta e intención de sync en una sola transacción local. | Debe |
| RF-SALE-07 | Asignar un código visible único por dispositivo (`ALM-A-000123`). | Debe |
| RF-SALE-08 | Evitar ventas duplicadas por doble clic o reintento. | Debe |
| RF-SALE-09 | Impedir vender sin turno abierto. | Debe |
| RF-SALE-10 | Congelar nombre y precio del producto al momento de la venta. | Debe |
| RF-SALE-11 | Operar la venta completa con teclado. | Debería |
| RF-SALE-12 | Tomar el precio del catálogo local, nunca del formulario. | Debe |
| RF-SALE-13 | En domicilio propio, registrar un cargo de envío editable que sume al total. | Debe |
| RF-SALE-14 | Mostrar la etiqueta de mesa en la venta y en el histórico. | Debe |

**CA-SALE**

| ID | Criterio |
|---|---|
| CA-SALE-01 | Dada una venta de 2 unidades a $16.500, entonces el total es $33.000. |
| CA-SALE-02 | Dado un doble clic en Cobrar, entonces se crea una sola venta. |
| CA-SALE-03 | Dada una falla al guardar la operación pendiente, entonces no queda venta huérfana. |
| CA-SALE-04 | Dado un turno cerrado, cuando se intenta vender, entonces se bloquea con un mensaje claro. |
| CA-SALE-05 | Dada una venta confirmada sin red, entonces aparece en ventas del día y en pendientes de sync. |
| CA-SALE-06 | Dado un cambio de precio posterior, entonces la venta conserva el precio aplicado. |
| CA-SALE-07 | Dados dos dispositivos distintos, entonces sus secuencias no colisionan. |
| CA-SALE-08 | Dado un domicilio con envío de $5.000 y productos por $20.000, entonces el total es $25.000. |
| CA-SALE-09 | Dada una venta de mesa con etiqueta “Mesa 4”, entonces la etiqueta aparece en el detalle y en el histórico. |
| CA-SALE-10 | Dado que se dejan de recibir pedidos a las 23:40, entonces una venta registrada a las 23:55 sigue perteneciendo al mismo día operativo. |

### 3.4 Devoluciones

| ID | Requisito | Prioridad |
|---|---|---|
| RF-REF-01 | Devolver una venta exigiendo motivo de al menos 5 caracteres. | Debe |
| RF-REF-02 | Permitir devoluciones sin conexión. | Debe |
| RF-REF-03 | Impedir devolver dos veces la misma venta. | Debe |
| RF-REF-04 | Atribuir la devolución al día en que se hace, no al día de la venta original. | Debe |
| RF-REF-05 | Auditar usuario, fecha, monto y motivo. | Debe |
| RF-REF-06 | Impedir devoluciones por encima del monto de la venta. | Debe |

**CA-REF**

| ID | Criterio |
|---|---|
| CA-REF-01 | Dado un motivo vacío, entonces la devolución se rechaza. |
| CA-REF-02 | Dada una venta en efectivo devuelta, entonces el efectivo esperado del turno actual baja. |
| CA-REF-03 | Dada una venta de un turno ya cerrado, cuando se devuelve hoy, entonces el reporte del turno cerrado no cambia. |
| CA-REF-04 | Dada una devolución repetida, entonces el servidor responde conflicto y no duplica el movimiento. |
| CA-REF-05 | Dada una devolución sin red, entonces se encola y sincroniza al volver. |

### 3.5 Turnos y caja

| ID | Requisito | Prioridad |
|---|---|---|
| RF-CASH-01 | Abrir turno con base inicial en efectivo. | Debe |
| RF-CASH-02 | Permitir un solo turno abierto por dispositivo. | Debe |
| RF-CASH-03 | Registrar retiros e ingresos de efectivo con motivo. | Debe |
| RF-CASH-04 | Calcular el efectivo esperado: base + ventas efectivo − devoluciones efectivo + ingresos − retiros. | Debe |
| RF-CASH-05 | Cerrar turno con efectivo contado y calcular la diferencia. | Debe |
| RF-CASH-06 | Bloquear ventas del turno cerrado. | Debe |
| RF-CASH-07 | Mostrar el historial de turnos cuando hay conexión. | Debe |
| RF-CASH-08 | Sincronizar apertura, movimientos y cierre con el servidor. | Debe |

**CA-CASH**

| ID | Criterio |
|---|---|
| CA-CASH-01 | Dada base $50.000, venta efectivo $16.500 y devolución efectivo $5.000, entonces el esperado es $61.500. |
| CA-CASH-02 | Dado un conteo de $60.000, entonces la diferencia es −$1.500. |
| CA-CASH-03 | Dado un turno abierto, cuando se intenta abrir otro, entonces se rechaza. |
| CA-CASH-04 | Dado el cierre, entonces el resumen queda visible y se encola para sincronizar. |
| CA-CASH-05 | Dado un cierre offline y luego sync, entonces el servidor recalcula y marca si hay diferencia entre ambos cálculos. |

### 3.6 Gastos y utilidad

| ID | Requisito | Prioridad |
|---|---|---|
| RF-EXP-01 | Registrar gasto con categoría, descripción, monto y fecha. | Debe |
| RF-EXP-02 | Exigir conexión y rol Encargado o Admin. | Debe |
| RF-EXP-03 | Listar y totalizar gastos por rango de fechas. | Debe |
| RF-EXP-04 | Calcular utilidad operativa = ventas netas − costo de productos − gastos. | Debe |
| RF-EXP-05 | Advertir cuando hay productos sin costo registrado. | Debería |

**CA-EXP**

| ID | Criterio |
|---|---|
| CA-EXP-01 | Dado un cajero, entonces no puede registrar gastos (403). |
| CA-EXP-02 | Dado un gasto de $10.000 y ventas netas de $18.500, entonces la utilidad es $8.500 (sin costos). |
| CA-EXP-03 | Dado un gasto sin conexión, entonces la pantalla lo impide y explica por qué. |
| CA-EXP-04 | Dado un producto sin costo, entonces el reporte lo cuenta como 0 y lo advierte. |

### 3.7 Reportes

| ID | Requisito | Prioridad |
|---|---|---|
| RF-REP-01 | Resumen por rango: ventas, devoluciones, neto, por medio de pago, ticket promedio. | Debe |
| RF-REP-02 | Desglose por producto y categoría. | Debe |
| RF-REP-03 | Desglose por hora. | Debería |
| RF-REP-04 | Reporte de turno calculado localmente, sin red. | Debe |
| RF-REP-05 | Reportes históricos requieren conexión. | Debe |
| RF-REP-06 | Exportar el resumen y los desgloses a CSV. | Debe |

**CA-REP**

| ID | Criterio |
|---|---|
| CA-REP-01 | Dadas dos ventas (efectivo $16.500, tarjeta $18.500) y una devolución de $16.500, entonces ventas = $35.000 y neto = $18.500. |
| CA-REP-02 | Dado un rango inválido (`from > to`), entonces el servidor responde 400. |
| CA-REP-03 | Dado un reporte local del día, entonces coincide con el central para las mismas ventas sincronizadas. |
| CA-REP-04 | Dado un reporte histórico sin red, entonces se informa que requiere conexión y no se muestra data incompleta. |

### 3.8 Sincronización

| ID | Requisito | Prioridad |
|---|---|---|
| RF-SYNC-01 | Encolar cada operación local con `operationId`, `seq` y tipo. | Debe |
| RF-SYNC-02 | Enviar en orden de `seq`; un hueco detiene el lote. | Debe |
| RF-SYNC-03 | Garantizar idempotencia por `operationId` en el servidor. | Debe |
| RF-SYNC-04 | Reintentar con backoff y nunca borrar operaciones locales. | Debe |
| RF-SYNC-05 | Sincronizar al recuperar red, al abrir la app y periódicamente. | Debe |
| RF-SYNC-06 | Mostrar estado: pendientes, sincronizando, error, al día. | Debe |
| RF-SYNC-07 | Marcar desfase de reloj mayor a 5 minutos. | Debe |
| RF-SYNC-08 | Rechazar operaciones de otro tenant o sede. | Debe |

**CA-SYNC**

| ID | Criterio |
|---|---|
| CA-SYNC-01 | Dado el mismo `operationId` dos veces, entonces se crea una sola venta y la segunda responde `DUPLICATE`. |
| CA-SYNC-02 | Dada una venta con `seq` posterior a un hueco, entonces responde `RETRY` y no se aplica. |
| CA-SYNC-03 | Dados 200 reintentos con respuestas perdidas, entonces no hay duplicados. |
| CA-SYNC-04 | Dado un corte de red, entonces la cola se conserva y el estado lo refleja. |
| CA-SYNC-05 | Dado un reloj desfasado, entonces la operación se acepta y queda marcada. |
| CA-SYNC-06 | Dado un token de otro tenant, entonces la operación se rechaza. |

### 3.9 Respaldos y recuperación

| ID | Requisito | Prioridad |
|---|---|---|
| RF-REC-01 | Exportar automáticamente las operaciones pendientes cada 5 minutos y antes de cerrar turno. | Debe |
| RF-REC-02 | Permitir exportación manual a archivo. | Debe |
| RF-REC-03 | Importar un archivo de pendientes de forma idempotente. | Debe |
| RF-REC-04 | Rechazar archivos corruptos sin modificar la base local. | Debe |
| RF-REC-05 | Mostrar el último export y alertar si supera 24 horas. | Debe |
| RF-REC-06 | Ejecutar `pg_dump` diario con retención 30 diarios y 12 semanales. | Debe |
| RF-REC-07 | Verificar el respaldo del servidor y documentar su restauración. | Debe |

**CA-REC**

| ID | Criterio |
|---|---|
| CA-REC-01 | Dadas 20 operaciones pendientes, cuando se exporta e importa dos veces, entonces quedan 20 y sin duplicados. |
| CA-REC-02 | Dado un archivo corrupto, entonces la importación falla y la base local queda intacta. |
| CA-REC-03 | Dado un perfil de navegador borrado, entonces las ventas se recuperan desde el archivo exportado. |
| CA-REC-04 | Dado un respaldo del servidor, entonces se restaura en una base limpia y conserva ventas y turnos. |
| CA-REC-05 | Dado 25 horas sin export, entonces la caja muestra una alerta visible. |

### 3.10 Administración y auditoría

| ID | Requisito | Prioridad |
|---|---|---|
| RF-ADM-01 | Crear, editar y desactivar usuarios; asignar rol. | Debe |
| RF-ADM-02 | Registrar, listar y revocar dispositivos. | Debe |
| RF-ADM-03 | Configurar nombre y código de la sede. | Debe |
| RF-ADM-04 | Consultar auditoría por rango: quién, qué, cuándo. | Debe |
| RF-ADM-05 | Registrar en auditoría devoluciones, cierres, gastos y cambios de catálogo. | Debe |

**CA-ADM**

| ID | Criterio |
|---|---|
| CA-ADM-01 | Dado un admin, entonces puede crear un usuario y asignarle rol. |
| CA-ADM-02 | Dado un usuario desactivado, entonces no puede iniciar sesión. |
| CA-ADM-03 | Dado un dispositivo revocado, entonces no sincroniza. |
| CA-ADM-04 | Dada una devolución, entonces aparece en auditoría con usuario, motivo y fecha. |

---

## 4. Requisitos no funcionales

| ID | Requisito | Métrica / verificación |
|---|---|---|
| RNF-01 | Operar sin Internet | Vender, devolver y cerrar turno con la red desconectada. |
| RNF-02 | No perder ventas confirmadas | 500 ventas offline sobreviven a cerrar Edge y reiniciar Windows. |
| RNF-03 | Atomicidad local | Venta y operación pendiente en una sola transacción; prueba de fallo inyectado. |
| RNF-04 | Idempotencia | 200 reintentos no duplican ventas. |
| RNF-05 | Orden | Un hueco de `seq` no se salta y no deja huérfanos. |
| RNF-06 | Rendimiento de venta | Guardar una venta local en < 300 ms p95 en la PC objetivo. |
| RNF-07 | Búsqueda | Filtrar catálogo en < 100 ms con 200 productos. |
| RNF-08 | Arranque | App utilizable en < 5 s tras abrir el navegador. |
| RNF-09 | Memoria | Pestaña de Caja < 300 MB en Windows 10 con 2 GB. |
| RNF-10 | Disponibilidad del backend | 99,5 % mensual; la caja no depende de ella para vender. |
| RNF-11 | Recuperación del servidor | RPO ≤ 24 h (respaldo diario); RTO ≤ 4 h. |
| RNF-12 | Seguridad de transporte | HTTPS obligatorio; HTTP rechazado en producción. |
| RNF-13 | Contraseñas | bcrypt cost 12; nunca en texto plano ni en logs. |
| RNF-14 | Sesión | Access token 15 min; refresh 30 días; PIN offline máximo 7 días. |
| RNF-15 | Aislamiento | Un token no accede a datos de otro tenant ni sede. |
| RNF-16 | Auditoría | Eventos append-only, sin edición ni borrado desde la app. |
| RNF-17 | Compatibilidad | Edge y Chrome últimas 2 versiones; Windows 10 64-bit; 1366×768. |
| RNF-18 | Usabilidad | Venta completa con teclado; textos en español; controles ≥ 44 px. |
| RNF-19 | Accesibilidad | Etiquetas en formularios, foco visible, contraste WCAG AA. |
| RNF-20 | Mantenibilidad | Cada caso de uso crítico tiene prueba automatizada; módulos sin dependencias cruzadas. |
| RNF-21 | Observabilidad | Logs estructurados, health check y errores con código. |
| RNF-22 | Portabilidad | Backend desplegable con Docker; proveedor intercambiable. |
| RNF-23 | Retención de datos | Ventas y auditoría se conservan mínimo 5 años; sin borrado automático en v1. |

---

## 5. Requisitos de interfaz

### 5.1 Principios

- Una sola pantalla principal: **Venta**. Todo lo demás se alcanza en un clic.
- El estado de sincronización y el estado del turno siempre visibles, sin abrir menús.
- Los errores se muestran en lenguaje del cajero, no en código técnico.
- Toda acción destructiva pide confirmación y motivo cuando aplica.
- Los colores no son el único indicador: siempre hay texto.

### 5.2 Pantallas

| ID | Pantalla | Actor | Propósito |
|---|---|---|---|
| UI-01 | Login | Todos | Autenticación online. |
| UI-02 | Bloqueo por PIN | Todos | Desbloqueo offline. |
| UI-03 | Venta | Cajero+ | Pantalla principal de venta. |
| UI-04 | Carrito y modificadores | Cajero+ | Componer la venta. |
| UI-05 | Cobro | Cajero+ | Medio de pago y confirmación. |
| UI-06 | Ventas del día | Cajero+ | Consultar y devolver. |
| UI-07 | Turno | Encargado+ | Abrir, movimientos y cerrar. |
| UI-08 | Gastos | Encargado+ | Registro y listado. |
| UI-09 | Reportes | Encargado+ | Resumen y desgloses. |
| UI-10 | Catálogo | Admin | Productos, categorías y modificadores. |
| UI-11 | Usuarios | Admin | Altas, roles y estado. |
| UI-12 | Dispositivos | Admin | Registro y revocación. |
| UI-13 | Recuperación | Admin | Exportar e importar pendientes. |
| UI-14 | Estado de sync | Todos | Componente persistente. |

### 5.3 Detalle por pantalla

**UI-03 Venta**

- Cabecera: sede, turno, usuario, estado de sync.
- Barra de búsqueda con foco automático y atajo `F2`.
- Tipo de venta: mostrador, domicilio (con envío) o mesa (etiqueta libre).
- Pestañas de categoría y grilla de productos con precio.
- Carrito a la derecha: líneas, cantidad, modificadores, nota, total.
- Acciones: `F4` cobrar, `F8` ventas del día, `Esc` limpiar con confirmación.
- Estados: cargando, vacío, sin turno, sin catálogo, offline, error.
- Sin turno abierto: la grilla se muestra deshabilitada con el motivo.

**UI-04 Carrito y modificadores**

- Modal con grupos obligatorios y opcionales, respetando mínimo y máximo.
- Precio adicional visible por opción y en el total.
- Nota por línea con contador de caracteres.
- Validación antes de cerrar: no se puede guardar una línea inválida.

**UI-05 Cobro**

- Total en grande, tres medios de pago: Efectivo, Tarjeta (datáfono), Bre-B (QR de Bold).
- En domicilio propio: campo de envío editable, incluido en el total.
- Confirmación explícita.
- Botón deshabilitado mientras se guarda; segundo clic no crea otra venta.
- Resultado: código visible, opción de nueva venta.
- Error de guardado: mensaje claro y la venta no se pierde del carrito.

**UI-06 Ventas del día**

- Lista con código, hora, total, medio y estado.
- Filtro por estado y búsqueda por código.
- Detalle con líneas, modificadores y devolución.
- Devolución: motivo obligatorio, confirmación, resultado visible.

**UI-07 Turno**

- Estado actual: abierto/cerrado, base, ventas efectivo, retiros, ingresos, esperado.
- Abrir con base inicial; cerrar con efectivo contado y diferencia calculada en vivo.
- Movimientos con tipo, monto y motivo.
- Cierre: confirmación y bloqueo de la venta.

**UI-09 Reportes**

- Selector de rango con atajos: hoy, ayer, semana.
- Tarjetas: ventas, neto, ticket promedio, devoluciones, utilidad.
- Desglose por medio de pago, producto, categoría y hora.
- Aviso de productos sin costo.
- Sin conexión: solo turno actual; el histórico se marca como no disponible.

**UI-10 Catálogo**

- Lista por categoría con búsqueda.
- Edición de precio, costo y disponibilidad en línea.
- Alta de producto, categoría y grupo de modificadores.
- Los cambios requieren conexión y se confirman.

**UI-13 Recuperación**

- Último export, pendientes y estado.
- Exportar ahora, importar archivo, restaurar con doble confirmación.
- Alerta visible si el último export supera 24 horas.

**UI-14 Estado de sync**

- Indicador persistente: `Al día`, `3 pendientes`, `Sincronizando`, `Error`.
- Al hacer clic: detalle de pendientes y último error.
- Nunca bloquea la venta.

---

## 6. Criterios de aceptación de extremo a extremo

Estos escenarios cierran v1. Si uno falla, v1 no se acepta.

| ID | Escenario | Resultado esperado |
|---|---|---|
| CA-E2E-01 | Venta completa con red | Se guarda local, sincroniza, aparece en el servidor y en reportes. |
| CA-E2E-02 | 500 ventas sin red, cerrar Edge y reiniciar Windows | Las 500 siguen, el turno cuadra y sincronizan al volver la red. |
| CA-E2E-03 | Doble clic en Cobrar | Una sola venta en local y en servidor. |
| CA-E2E-04 | Corte de red a mitad de sync | La cola no se pierde y no hay duplicados al reintentar. |
| CA-E2E-05 | Cierre de turno offline | Esperado y diferencia correctos; el servidor coincide al sincronizar. |
| CA-E2E-06 | Devolución offline de venta de turno cerrado | Se registra hoy y no altera el reporte del turno original. |
| CA-E2E-07 | Perfil de navegador borrado | Se restauran las ventas pendientes desde el archivo exportado. |
| CA-E2E-08 | Backend apagado | La caja vende, cierra y muestra pendientes; al volver, sincroniza. |
| CA-E2E-09 | Token de otro tenant | Rechazo 403, sin fuga de datos. |
| CA-E2E-10 | Cambio de precio con la caja offline | La venta usa el precio vigente al momento de vender y no se reescribe. |
| CA-E2E-11 | Reloj de la PC adelantado 30 minutos | La venta se acepta y queda marcada con desfase. |
| CA-E2E-12 | Restauración de `pg_dump` en base limpia | Ventas, turnos y auditoría íntegros. |

---

## 7. Trazabilidad requisito → tarea del plan

| Módulo | Requisitos | Tareas |
|---|---|---|
| Autenticación | RF-AUTH-01…07 | 3, 9 |
| Catálogo | RF-CAT-01…09 | 4, 9, 13 |
| Venta | RF-SALE-01…14 | 5, 10 |
| Devoluciones | RF-REF-01…06 | 5, 6, 13 |
| Turnos y caja | RF-CASH-01…08 | 5, 7, 12 |
| Gastos y utilidad | RF-EXP-01…05 | 7, 13 |
| Reportes | RF-REP-01…06 | 7, 12 |
| Sincronización | RF-SYNC-01…08 | 6, 11 |
| Respaldos y recuperación | RF-REC-01…07 | 14, 15 |
| Administración | RF-ADM-01…05 | 3, 13 |
| No funcionales | RNF-01…23 | 1–15 |

---

## 8. Decisiones resueltas (2026-11-05)

| # | Decisión | Efecto |
|---|---|---|
| D-01 | En Almendros y Caney hay mesas. | Venta con etiqueta de mesa. Sin mapa ni cuenta abierta en v1. |
| D-02 | El domicilio propio cobra envío. En Almendros no hay domiciliario propio; en Caney sí. | Campo de envío editable en la venta. Sin registro de domiciliario en v1. |
| D-03 | El local cierra a medianoche y deja de recibir pedidos a las 23:40. | Día operativo calendario (00:00). No se parte el turno. |
| D-04 | “Bolt” era Bold: pantalla con QR para pagar por Bre-B. También hay datáfono. | Medios: Efectivo, Tarjeta, Bre-B (Bold). Solo registro, sin integración. |
| D-05 | Caney se observa después de v1. | v1 es Almendros; el modelo soporta sedes. |
| D-06 | Retención mínima de 5 años, sin borrado automático en v1. | RNF-23. |
| D-07 | Exportación CSV de reportes. | RF-REP-06 pasa a **Debe**. |
| D-08 | Registro manual de pedidos de Rappi/DiDi fuera de v1. | D11 sigue como candidato futuro. |
| D-09 | Un solo despliegue en la nube; dispositivos por sede. | `location_id` por dispositivo. |
| D-10 | Facturación electrónica fuera de v1. | Modelo de venta preparado, sin emisión. |
| D-11 | Respaldo de pendientes en carpeta sincronizada (OneDrive/Drive) + descarga manual. | RF-REC-01…05. |
| D-12 | No hay PC de reemplazo hoy; se conseguirá si falla. | Procedimiento documentado; sin hardware en v1. |
| D-13 | Las mesas se registran con etiqueta al cobrar. No hay cuenta abierta por mesa en v1. | Venta de mesa sin estado de ocupación; cuenta abierta queda para Order Core. |

## 9. Pendientes que quedan

| # | Pendiente | Afecta | Bloquea v1 |
|---|---|---|---|
| P1 | Proveedor de nube. Se evalúa Vercel; Vercel sirve para la PWA, pero no para Spring Boot ni PostgreSQL. | Despliegue | No. Se decide antes de la Tarea 15 y está sujeto a cambios. |
| P2 | Costo por producto para utilidad exacta. El menú tiene precios de venta, no costos. | Utilidad | No. Costo opcional con advertencia. |
| P3 | ~~¿Cuenta abierta por mesa?~~ Resuelto: etiqueta al cobrar (D-13). | — | No. |
| P4 | ¿Habrá PC de reemplazo disponible el día que falle la actual? | Recuperación | No. Procedimiento documentado. |
| P5 | Observación de Caney y diferencias entre sedes. | Fase 2 | No. |

## 10. Definición de “terminado” para v1

1. Todos los requisitos marcados **Debe** implementados.
2. Todos los CA con prueba automatizada o evidencia manual registrada.
3. Los 12 escenarios de extremo a extremo en verde.
4. Instalado en la PC de Almendros, usado en un turno real.
5. Manual de operación y runbook de recuperación entregados.
6. Respaldo del servidor restaurado con éxito en una base limpia.
