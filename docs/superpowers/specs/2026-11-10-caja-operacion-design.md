# Caja: movimientos, gastos y cierre — Diseño

**Fecha:** 2026-11-10
**Estado:** pendiente de aprobación del usuario.
**Contexto:** `docs/estado.md`, `docs/superpowers/specs/2026-11-06-modelo-datos-design.md`, `docs/superpowers/specs/2026-11-09-mejoras-operacion-design.md`.
**Plan:** se escribe después de aprobar este documento.

---

## 1. Intención

Hoy la pantalla de Caja solo abre un turno con fondo y lo cierra después de
escribir un total contado. La operación real es más rica:

- A la caja entra y sale efectivo durante el turno.
- En emergencias se paga con efectivo de la caja: un domicilio, lechuga,
  jabón. Normalmente esos gastos los paga el dueño y llegan en pedidos; el
  efectivo de la caja se usa solo cuando algo se acaba y urge.
- El cierre se documenta hoy en un Excel. Los dueños sí usan la información de
  gastos y categorías.
- Hay tres sedes y no está definido si los dueños consolidan gastos y cierres
  por sede o por el total del negocio.

El objetivo es que Caja registre lo que pasa con el efectivo de esa sede, sin
inventar una contabilidad global que todavía no se ha acordado.

## 2. Decisiones

| # | Decisión | Efecto |
|---|---|---|
| D-19 | Caja registra ingresos y retiros de efectivo con motivo. | Todo movimiento exige un motivo de 5 a 200 caracteres. Funciona sin conexión y se encola como `CASH_MOVEMENT`. El efectivo esperado lo suma o resta de inmediato. |
| D-20 | Un gasto pagado con caja es un retiro marcado como gasto, con categoría obligatoria. | En una sola acción se registra la salida del efectivo y el gasto de esa sede. El arqueo baja y el gasto aparece en Reportes, una sola vez. |
| D-21 | El cierre se cuenta por denominaciones. | Billetes y monedas se ingresan por cantidad; el total contado es la suma. El desglose queda guardado en el turno. |
| D-22 | Si hay diferencia, el cierre exige una nota. | La nota tiene 5 a 200 caracteres y queda en el historial y en el cierre exportable. Sin diferencia, la nota es opcional. |
| D-23 | Caja muestra el historial de turnos y exporta el cierre en CSV. | El CSV imita el cierre que hoy se hace en Excel: apertura, ventas por medio, devoluciones, movimientos, gastos por categoría, arqueo, diferencia, nota y denominaciones. |
| D-24 | Las categorías de gasto se guardan en el dispositivo. | La caja siempre tiene categorías disponibles, incluso sin internet. Se siembran las seis actuales y se actualizan desde el servidor cuando hay conexión. |
| D-25 | Los gastos y cierres siguen siendo por sede. | No se crea consolidación entre las tres sedes. Esa decisión queda pendiente con los dueños y fuera de esta entrega. |
| D-26 | Cualquier usuario autenticado puede operar Caja. | Abrir, cerrar, registrar, editar y anular movimientos no exige ser Encargado. Hay días en que el encargado de la sede no está y el responsable de la caja es otra persona. Reportes y el formulario de gastos por fuera siguen siendo Encargado/Admin. |
| D-27 | Un movimiento se puede editar o anular mientras el turno esté abierto. | La corrección se sincroniza como una operación nueva que anula la anterior y, si aplica, crea la corregida. No se reescribe el histórico: el movimiento viejo queda anulado con usuario y fecha. Un turno cerrado no se edita. |

### Gasto de caja: por qué una sola acción

Se consideraron tres formas:

- **Solo retiro con motivo.** Es lo más barato, pero el gasto no aparece en
  Reportes y la utilidad queda inflada. Se descartó.
- **Gasto en Reportes con origen "caja".** Reutiliza el formulario actual, pero
  exige conexión y el rol gerente/admin, justo cuando la urgencia la atiende
  quien está en caja. Se descartó.
- **Retiro que también es gasto (elegida).** La caja registra el movimiento y el
  gasto en una sola operación offline. El arqueo y el reporte quedan cuadrados
  con un solo registro para el usuario.

El gasto se guarda en `expenses` al sincronizar, con el mismo monto, motivo y
categoría del movimiento. El movimiento queda en `cash_movements`. Son dos
filas porque responden a dos preguntas distintas —cuánto salió del cajón y en
qué se gastó—, pero nacen de una sola acción y no se suman dos veces: el
arqueo solo lee `cash_movements` y el reporte de utilidad solo lee `expenses`.

## 3. Alcance

### 3.1 Dentro

- Registrar ingresos de efectivo (fondo adicional, cambio, reposición).
- Registrar retiros de efectivo con motivo.
- Registrar un gasto pagado con caja: retiro + categoría + descripción.
- Ver los movimientos del turno abierto.
- Editar o anular un movimiento mientras el turno está abierto.
- Cerrar el turno contando billetes y monedas.
- Exigir nota cuando el contado no coincide con el esperado.
- Ver turnos anteriores con su arqueo, diferencia y nota.
- Descargar el cierre de un turno en CSV.
- Mantener las categorías de gasto disponibles sin conexión.
- Mantener los gastos pagados por fuera en Reportes, como hoy.

### 3.2 Fuera

- Consolidar gastos o cierres entre las tres sedes.
- Cambiar cómo se registran los gastos que paga el dueño o los que llegan en
  pedidos.
- Editar o reabrir un turno cerrado.
- Editar o anular un movimiento después de cerrar el turno.
- Aprobación del gerente para un retiro o gasto de caja.
- Varias cajas o cajones por dispositivo.
- Integración con hardware de cajón, lector de billetes o balanza.
- Facturación electrónica o impuestos.
- Convertir las categorías de gasto en un catálogo global del negocio.

## 4. Estado actual que se reutiliza

- `cash_movements` ya existe en el backend con `DEPOSIT`/`WITHDRAWAL`, monto,
  motivo y fecha operativa.
- `ShiftApplicationService.expectedCash` ya suma depósitos y resta retiros.
- El motor de sincronización ya acepta `CASH_MOVEMENT`; hoy no hay pantalla que
  lo produzca.
- La base local ya tiene la tabla `cashMovements`, pero solo se lee para el
  arqueo.
- `shifts` ya guarda `counted_cash_pesos`, `expected_local_pesos`,
  `expected_server_pesos` y `difference_pesos`; la interfaz no muestra turnos
  cerrados.
- `expenses` y `expense_categories` ya existen, con seis categorías sembradas
  por sede: Domicilios, Fruver, Insumos, Aseo, Servicios y Otros.
- `ReportService` ya agrupa gastos por el texto congelado de la categoría.

## 5. Modelo de datos

### 5.1 Backend

Migración `025-caja-operacion.yaml`:

- `shifts.counted_breakdown jsonb`: mapa `denominación → cantidad`. Nulo en
  turnos viejos.
- `shifts.close_note varchar(200)`: nota del cierre. Nula si no hubo diferencia
  o en turnos viejos.
- `expenses.cash_movement_id uuid`: vínculo con el movimiento que originó el
  gasto. Nulo en gastos pagados por fuera.
- `expenses.voided_at timestamptz` y `expenses.voided_by uuid`: anulación del
  gasto cuando se corrige o anula su movimiento. Los reportes y el listado
  excluyen los gastos anulados.
- `cash_movements.voided_at timestamptz`, `cash_movements.voided_by uuid` y
  `cash_movements.replaces_movement_id uuid`: trazabilidad de la corrección. El
  efectivo esperado excluye los movimientos anulados.
- Restricción de integridad para que `cash_movement_id` y
  `replaces_movement_id` pertenezcan al mismo tenant y sede, más un índice único
  parcial para que un movimiento no genere dos gastos activos.
- Restricción de longitud para `close_note` cuando no es nula.

No se agregan tipos de operación de sincronización. El gasto de caja viaja
dentro del `CASH_MOVEMENT` que ya existe, y la corrección usa el mismo tipo con
los campos `replacesMovementId` y `voided`.

### 5.2 Base local

Versión nueva de Dexie:

- Tabla `expenseCategories` con `name`, `sortOrder` y `active`. La clave es el
  nombre; no se guardan ids porque la caja puede crear el gasto sin conexión.
- `ShiftRow` agrega `countedBreakdown?: Record<string, number>` y
  `closeNote?: string | null`.
- `CashMovementRow` agrega `expenseCategoryName?: string | null`. Su presencia
  marca que el retiro es un gasto.
- `CashMovementRow` agrega `voidedAt?: string | null`, `voidedBy?: string | null`
  y `replacesMovementId?: string | null`.
- Al crear la base se siembran las seis categorías actuales. Cuando hay
  conexión se reemplazan por las que devuelve el servidor, conservando solo las
  activas.

### 5.3 Categorías sin conexión

El `GET /api/expenses/categories` pasa de ser solo para gerente/admin a estar
disponible para cualquier usuario autenticado. Son nombres, no datos
sensibles, y la caja los necesita para trabajar sin conexión.

Si la lista local quedara vacía por cualquier motivo, el formulario de gasto
ofrece "Otros" como respaldo. La categoría nunca bloquea una urgencia.

### 5.4 Roles y permisos

- **Caja:** cualquier usuario autenticado. Abrir, cerrar, registrar, editar y
  anular. El turno es por dispositivo y la persona responsable puede no ser el
  encargado de la sede.
- **Reportes y formulario de gastos por fuera:** se mantiene Encargado/Admin.
- **Categorías de gasto:** lectura para cualquier usuario autenticado; alta,
  edición y desactivación solo Admin, como hoy.
- **Servidor:** no confía en el rol del cliente para el movimiento de caja, pero
  sí valida que el usuario y el turno pertenezcan al tenant y a la sede. El
  gasto de caja se crea por sincronización, no por el endpoint de gastos.

Esta decisión reemplaza para Caja la restricción `UI-07` de la v1. El criterio
`CA-EXP-01` sigue vigente para el formulario de gastos por fuera.

## 6. Flujos

### 6.1 Abrir turno

Igual que hoy: un solo turno abierto por dispositivo, fondo inicial entero no
negativo. El turno guarda la fecha operativa de Bogotá.

### 6.2 Movimiento de efectivo

1. La caja exige un turno abierto.
2. El usuario elige ingreso o retiro.
3. Escribe monto y motivo.
4. Si es gasto, elige una categoría de la lista local.
5. Se guarda el movimiento y se encola `CASH_MOVEMENT` en la misma transacción
   de Dexie.
6. El efectivo esperado se recalcula con el movimiento incluido.

Validaciones:

- Monto entero mayor que cero.
- Motivo de 5 a 200 caracteres.
- Categoría obligatoria cuando el retiro es un gasto.
- Un retiro mayor que el efectivo esperado se advierte pero se permite: puede
  haber efectivo no registrado. La diferencia se verá en el cierre.

### 6.3 Editar o anular un movimiento

Mientras el turno está abierto, cada movimiento activo tiene **Editar** y
**Anular**. Al cerrar, los botones desaparecen y el turno queda inmutable.

Editar abre el mismo formulario con los datos actuales. Al guardar:

1. El movimiento viejo se marca como anulado (`voidedAt`, `voidedBy`). No se
   borra.
2. Se crea un movimiento nuevo con `replacesMovementId` apuntando al viejo.
3. Se encola un `CASH_MOVEMENT` nuevo con `replacesMovementId` y los datos
   corregidos.
4. El efectivo esperado se recalcula con el movimiento nuevo y sin el viejo.

Anular hace lo mismo, pero sin movimiento nuevo: encola `CASH_MOVEMENT` con
`replacesMovementId` y `voided: true`.

El servidor, en una sola transacción:

1. Busca el movimiento corregido en el tenant, la sede y el turno.
2. Si existe y no está anulado, lo marca como anulado y anula el gasto
   vinculado. Si no existe —porque la operación original fue rechazada—, sigue
   sin error.
3. Si `voided` es verdadero, termina.
4. Si no, inserta el movimiento corregido y su gasto.

El servidor rechaza la corrección si el turno ya está cerrado. La lista de Caja
muestra los movimientos activos y permite ver los anulados en una sección
aparte; el cierre exportable incluye una sección de movimientos anulados para
que la corrección quede auditada.

### 6.4 Sincronización del gasto de caja

El payload de `CASH_MOVEMENT` agrega `expenseCategoryName` cuando es gasto. El
identificador del movimiento es el `entityId` de la operación, para poder
vincular el gasto sin un campo adicional.

Al aplicar la operación, el servidor, en la misma transacción:

1. Inserta el movimiento en `cash_movements`.
2. Si viene categoría, resuelve la categoría por nombre en el tenant y la sede
   —activa o no— y crea la fila en `expenses` con el texto congelado, el motivo
   como descripción y `cash_movement_id` del movimiento.
3. Registra la auditoría del movimiento y del gasto.

Si el nombre no existe en el servidor porque el dispositivo tenía una lista
vieja, el gasto se guarda igual con el texto congelado y sin id de categoría.
No se rechaza la operación: el efectivo ya salió y perder el registro sería
peor. Es la misma tolerancia que ya existe para gastos con texto legado.

### 6.5 Cierre por denominaciones

Denominaciones de pesos colombianos:

`100.000, 50.000, 20.000, 10.000, 5.000, 2.000, 1.000, 500, 200, 100, 50`

La pantalla muestra una fila por denominación con la cantidad. El total contado
se calcula, no se escribe a mano. El desglose se guarda en el turno y viaja en
el `CLOSE_SHIFT`.

Al cerrar:

1. Se calcula el efectivo esperado con el mismo caso de uso que usa la pantalla.
2. Se calcula la diferencia.
3. Si la diferencia no es cero, la nota es obligatoria.
4. Se actualiza el turno local y se encola `CLOSE_SHIFT` con contado, desglose,
   esperado, diferencia y nota.

El servidor revalida la suma del desglose y, si la nota viene, su longitud. No
rechaza el cierre porque el esperado del servidor difiera del local: guarda
`expected_local_pesos` y `expected_server_pesos`, calcula la diferencia con el
valor del servidor y deja el turno cerrado. Así se cumple CA-CASH-05 (marcar la
diferencia entre ambos cálculos) y no se deja al dispositivo con un turno local
cerrado y una operación imposible de sincronizar. Las operaciones viejas sin
desglose o sin nota siguen aceptándose.

### 6.6 Historial y exportación

Caja lista los turnos locales, más recientes primero: fecha operativa, apertura,
esperado, contado, diferencia y nota. Cada turno cerrado tiene un botón para
descargar su cierre. El export del resumen diario que hoy vive en Caja se mueve
a Reportes; Caja exporta cierres de turno.

El CSV de cierre usa `;` y BOM, como los exports actuales, para abrirse bien en
Excel. Secciones:

- Encabezado: fecha operativa, identificador del turno, usuario que abrió y
  usuario que cerró.
- Apertura y ventas por medio de pago (efectivo, tarjeta, Bre-B).
- Devoluciones por medio.
- Ingresos y retiros, con motivo y categoría cuando aplique.
- Gastos de caja agrupados por categoría.
- Arqueo: esperado, contado, diferencia y nota.
- Denominaciones: cantidad por denominación y subtotal.
- Movimientos anulados, con quién y cuándo, solo si existen.

### 6.7 Reportes

- La pantalla de Gastos sigue en Reportes, con el mismo formulario y la misma
  restricción de rol.
- Los gastos de caja aparecen ahí después de sincronizar, como un gasto más de
  la sede, con su categoría.
- Un gasto de caja se edita o anula desde Caja, no desde el formulario de
  Reportes. El formulario de Reportes sigue siendo solo para gastos pagados por
  fuera.
- El resumen del día incluye los gastos de caja locales aunque todavía no hayan
  sincronizado, para que el cierre y el reporte no se contradigan. Cuando el
  resumen remoto está disponible, se suman solo los gastos de caja locales que
  siguen pendientes de sincronizar, evitando contarlos dos veces.
- No se muestra ni se calcula ningún total entre sedes.

## 7. Requisitos y criterios de aceptación

| ID | Requisito |
|---|---|
| RF-CAJA-01 | Registrar ingresos y retiros de efectivo con motivo durante un turno abierto. |
| RF-CAJA-02 | Todo movimiento funciona sin conexión y se sincroniza con el orden existente. |
| RF-CAJA-03 | Un retiro puede marcarse como gasto; entonces exige categoría. |
| RF-CAJA-04 | El gasto de caja baja el efectivo esperado y aparece en Reportes una sola vez. |
| RF-CAJA-05 | El cierre cuenta por denominaciones y guarda el desglose. |
| RF-CAJA-06 | Si hay diferencia, el cierre exige una nota de 5 a 200 caracteres. |
| RF-CAJA-07 | Caja muestra los turnos anteriores con su arqueo, diferencia y nota. |
| RF-CAJA-08 | Un turno cerrado se puede exportar como CSV de cierre. |
| RF-CAJA-09 | Las categorías de gasto están disponibles sin conexión. |
| RF-CAJA-10 | Los gastos pagados por fuera de la caja siguen registrándose en Reportes. |
| RF-CAJA-11 | Un movimiento se puede editar o anular mientras el turno está abierto. |
| RF-CAJA-12 | La corrección no borra el movimiento viejo: lo anula y deja rastro de usuario y fecha. |
| RF-CAJA-13 | Un movimiento o gasto anulado no afecta el arqueo ni los reportes. |
| RF-CAJA-14 | Cualquier usuario autenticado puede operar Caja; Reportes y gastos por fuera siguen siendo Encargado/Admin. |

| ID | Criterio de aceptación |
|---|---|
| CA-CAJA-01 | Dado un turno con fondo de $50.000, cuando se registra un ingreso de $10.000, entonces el esperado es $60.000. |
| CA-CAJA-02 | Dado el mismo turno, cuando se registra un retiro de $5.000, entonces el esperado es $55.000. |
| CA-CAJA-03 | Cuando el retiro se marca como gasto con categoría Fruver por $5.000, entonces el esperado baja a $55.000 y el gasto aparece una sola vez en Fruver. |
| CA-CAJA-04 | Cuando se intenta un gasto de caja sin categoría, entonces la caja no lo guarda. |
| CA-CAJA-05 | Cuando se cierra con 2 billetes de $20.000 y 3 monedas de $1.000, entonces el contado es $43.000 y el desglose queda guardado. |
| CA-CAJA-06 | Cuando el contado no coincide con el esperado y no hay nota, entonces el cierre se rechaza. |
| CA-CAJA-07 | Cuando el cierre tiene diferencia y nota válida, entonces el historial muestra ambos. |
| CA-CAJA-08 | Cuando se descarga el cierre, entonces el CSV incluye apertura, ventas por medio, gastos de caja por categoría, arqueo y denominaciones. |
| CA-CAJA-09 | Sin conexión, la caja ofrece las seis categorías y puede guardar un gasto. |
| CA-CAJA-10 | Al sincronizar un gasto de caja, el movimiento y el gasto se crean juntos; si la operación se repite, no se duplican. |
| CA-CAJA-11 | Cuando el esperado del servidor difiere del local, el cierre se acepta y quedan guardados ambos esperados y la diferencia del servidor. |
| CA-CAJA-12 | Cuando se edita el monto de un retiro de $5.000 a $3.000, entonces el esperado sube $2.000 y el movimiento viejo queda anulado. |
| CA-CAJA-13 | Cuando se edita la categoría de un gasto de Fruver a Aseo, entonces el gasto viejo queda anulado y el nuevo aparece una sola vez en Aseo. |
| CA-CAJA-14 | Cuando se intenta editar o anular un movimiento de un turno cerrado, entonces la caja no ofrece la acción y el servidor rechaza la corrección. |
| CA-CAJA-15 | Dado un cajero, cuando opera Caja, entonces puede abrir, mover y cerrar; cuando intenta entrar a Reportes, entonces sigue bloqueado. |

## 8. Riesgos y bordes

- **Doble conteo.** El arqueo solo lee `cash_movements` y la utilidad solo lee
  `expenses`. Nunca se suman las dos fuentes.
- **Categoría desactualizada.** Si el dispositivo tiene un nombre que el
  servidor ya no conoce, el gasto se guarda con ese texto. No se pierde el
  movimiento.
- **Diferencia del servidor distinta.** La sincronización aplica las operaciones
  en orden, así que el esperado del servidor debería coincidir con el local. Si
  no coincide, el cierre se acepta igual y quedan guardados ambos esperados; el
  turno no se reabre. La nota se exige localmente según la diferencia que vio el
  usuario, y el servidor solo valida su longitud si viene.
- **Retiro mayor que el esperado.** Se advierte y se permite. El cierre muestra
  la diferencia real.
- **Corrección de un movimiento ya sincronizado.** No se reescribe: se anula y
  se crea otro. El servidor aplica la corrección en el mismo orden de
  sincronización, así que el arqueo remoto termina igual al local.
- **Movimiento original rechazado.** Si la operación original nunca se aplicó,
  la corrección no encuentra nada que anular y crea el movimiento corregido. No
  se bloquea.
- **Gasto anulado.** Los reportes y el listado de gastos excluyen los anulados;
  la fila se conserva para auditoría. El cierre exportable muestra la sección de
  anulados.
- **Categorías entre sedes.** Siguen siendo por sede, como hoy. Si los dueños
  quieren un catálogo único, es otra decisión.
- **Historial local.** El historial de turnos es del dispositivo. Ver turnos de
  otras cajas o sedes requiere un endpoint central y queda fuera.
- **Datos viejos.** Los turnos y operaciones anteriores no se reescriben; los
  campos nuevos son nulos y el servidor acepta los payloads antiguos.

## 9. Decisiones pendientes (no bloquean)

- Cómo consolidan los dueños los gastos y cierres de las tres sedes.
- Si el catálogo de categorías debe ser único para todo el negocio.
- Si un retiro o gasto de caja necesitará aprobación del gerente más adelante.

## 10. Verificación

- Backend: pruebas de integración del movimiento con y sin gasto, arqueo,
  edición y anulación (incluido el movimiento original rechazado), cierre con
  desglose y nota, compatibilidad de payloads viejos e idempotencia.
- Frontend: pruebas de los casos de uso de movimiento, edición, anulación,
  cierre, resumen local y CSV; pruebas de pantalla para el formulario, el
  cierre, el historial y la ausencia de acciones tras cerrar.
- E2E: abrir turno, registrar un gasto de caja, editarlo, anular otro
  movimiento, cerrar con denominaciones, descargar el CSV y verificar el
  esperado.
- Documentación: manual de operación, endpoints y estado, incluida la decisión
  de roles y el límite de edición al turno abierto.
