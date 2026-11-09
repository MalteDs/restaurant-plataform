# Mejoras de operación de caja — Diseño

**Fecha:** 2026-11-09
**Estado:** aprobado por el usuario en la sesión de levantamiento.
**Contexto:** `docs/requisitos-v1.md`, `docs/superpowers/specs/2026-11-06-modelo-datos-design.md`.
**Plan:** `docs/superpowers/plans/2026-11-09-mejoras-operacion-caja.md`.

---

## 1. Intención

La caja v1 ya vende, devuelve, cierra turno y reporta. El uso real con usuarios
mostró cuatro necesidades que no estaban en el alcance original:

1. Promociones que solo se venden de lunes a jueves.
2. Cambiar el precio de una línea al facturar.
3. Cobrar una venta con varios medios de pago.
4. Agrupar los gastos por categoría administrable.

Este documento fija las decisiones de negocio y los criterios de aceptación. El
plan de implementación define archivos, firmas y pruebas.

## 2. Decisiones

| # | Decisión | Efecto |
|---|---|---|
| D-14 | Las promociones son combos del catálogo con días de venta. | `products.sale_days` guarda días ISO 1–7 separados por coma. Vacío = todos los días. Fuera de los días permitidos el producto no aparece en la pantalla de venta. No hay motor de descuentos ni precios por día. |
| D-15 | El precio de una línea solo lo cambia un Encargado o Admin, con motivo. | Se guarda el precio de lista, el precio aplicado, el motivo y el usuario. El servidor revalida el rol al sincronizar. La venta funciona offline. |
| D-16 | Una venta puede tener uno o varios pagos. | Cada pago tiene medio y monto. La suma debe ser igual al total. El efectivo esperado del turno cuenta solo las porciones en efectivo. |
| D-17 | La devolución sigue siendo total y con un solo medio elegido por el usuario. | No se replica automáticamente la distribución de la venta. El arqueo descuenta el monto devuelto solo si el medio elegido es efectivo. |
| D-18 | Las categorías de gasto son un catálogo por sede administrado por el Admin. | El gasto nuevo exige una categoría activa. Se conserva el texto de la categoría en el gasto para no reescribir el histórico. Los reportes agrupan por ese texto congelado. |

### Precios de promoción

El usuario mencionó ejemplos (combo Tú y Yo más barato, dos especiales por
$22.500, combo callejero de hamburguesa y salchipapa), pero no la lista completa
ni todos los precios. Por eso **el sistema no siembra promociones ni precios**:
el Admin las crea o edita en el catálogo con sus días. Esto evita fijar en código
un precio que todavía no está confirmado.

## 3. Requisitos y criterios de aceptación

### 3.1 Promociones por día

| ID | Requisito |
|---|---|
| RF-PROMO-01 | Un producto puede limitar sus días de venta a un subconjunto de lunes a domingo. |
| RF-PROMO-02 | La pantalla de venta solo muestra productos vendibles en el día operativo actual de Bogotá. |
| RF-PROMO-03 | Un producto sin días configurados se vende todos los días. |
| RF-PROMO-04 | El Admin configura los días desde el catálogo. |

| ID | Criterio de aceptación |
|---|---|
| CA-PROMO-01 | Dado un combo con días `1,2,3,4`, cuando se abre la venta un lunes, entonces aparece; un viernes, entonces no aparece. |
| CA-PROMO-02 | Dado un producto sin días, entonces aparece cualquier día. |
| CA-PROMO-03 | Dado un valor de días fuera de 1–7, entonces el servidor responde 400. |

### 3.2 Cambio de precio por línea

| ID | Requisito |
|---|---|
| RF-PRICE-01 | Encargado o Admin puede cambiar el precio unitario de una línea antes de cobrar. |
| RF-PRICE-02 | El cambio exige un motivo de 5 a 200 caracteres. |
| RF-PRICE-03 | La venta conserva el precio de lista, el precio aplicado, el motivo y el usuario que autorizó. |
| RF-PRICE-04 | El cambio funciona sin conexión y el servidor lo revalida al sincronizar. |
| RF-PRICE-05 | Cada cambio deja un evento de auditoría. |

| ID | Criterio de aceptación |
|---|---|
| CA-PRICE-01 | Dado un cajero, cuando intenta cambiar un precio, entonces la caja lo impide y el servidor rechaza la operación si llegara. |
| CA-PRICE-02 | Dado un encargado con motivo válido, cuando cambia $16.500 a $14.000, entonces el total usa $14.000 y se conservan ambos precios. |
| CA-PRICE-03 | Dado un cambio sin motivo o con motivo de menos de 5 caracteres, entonces se rechaza y no se crea la venta. |
| CA-PRICE-04 | Dado un cambio guardado, entonces existe un evento `PRICE_OVERRIDDEN` con producto, precios, motivo y usuario. |

### 3.3 Pago combinado

| ID | Requisito |
|---|---|
| RF-PAY-01 | Registrar uno o varios pagos por venta, cada uno con medio y monto. |
| RF-PAY-02 | Exigir que la suma de los pagos sea igual al total de la venta. |
| RF-PAY-03 | Calcular el efectivo esperado solo con las porciones pagadas en efectivo. |
| RF-PAY-04 | Aceptar operaciones antiguas que traen un solo `method` para no perder la cola offline. |

| ID | Criterio de aceptación |
|---|---|
| CA-PAY-01 | Dada una venta de $20.000 pagada $12.000 en efectivo y $8.000 con tarjeta, entonces se guardan dos pagos y el total es $20.000. |
| CA-PAY-02 | Dada una suma de pagos distinta al total, entonces se rechaza la venta completa. |
| CA-PAY-03 | Dada base $50.000 y la venta anterior, entonces el efectivo esperado es $62.000. |
| CA-PAY-04 | Dada una operación antigua con `method` y sin `payments`, entonces sincroniza como un pago por el total. |
| CA-PAY-05 | Dada una venta con pago combinado, la devolución registra el medio elegido por el usuario. |

### 3.4 Gastos por categoría

| ID | Requisito |
|---|---|
| RF-EXPCAT-01 | Administrar categorías de gasto por sede: crear, renombrar y activar/desactivar. |
| RF-EXPCAT-02 | Registrar un gasto solo con una categoría activa. |
| RF-EXPCAT-03 | Agrupar los gastos por categoría en el resumen. |
| RF-EXPCAT-04 | Conservar el nombre de la categoría en cada gasto histórico. |

| ID | Criterio de aceptación |
|---|---|
| CA-EXPCAT-01 | Dado un gasto sin categoría válida, entonces el servidor responde 400. |
| CA-EXPCAT-02 | Dada una categoría desactivada, entonces no se puede usar en gastos nuevos. |
| CA-EXPCAT-03 | Dados gastos de Domicilios $10.000 y Fruver $5.000, entonces el reporte muestra ambos grupos. |
| CA-EXPCAT-04 | Dado un gasto histórico y una categoría renombrada, entonces el gasto conserva el nombre con el que se registró. |

## 4. Fuera de alcance

- Motor de promociones, descuentos porcentuales, vigencias por fecha o 2x1.
- Precio distinto según el día sin cambiar el producto.
- Devoluciones parciales o devolución repartida por medio.
- Gastos sin conexión.
- Presupuestos o topes por categoría de gasto.
- Sembrar precios o promociones no confirmados.
- Alta de productos o combos desde la interfaz: se editan los existentes; los nuevos se crean con la API documentada. Es una brecha previa de v1, no de esta iteración.

## 5. Preguntas abiertas

Ninguna. Las cuatro decisiones fueron confirmadas por el usuario.
