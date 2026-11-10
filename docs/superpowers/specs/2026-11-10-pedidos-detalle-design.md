# Pedidos: detalle y devolución segura — Diseño

**Fecha:** 2026-11-10
**Estado:** propuesto, pendiente de aprobación
**Pantalla:** `/orders` (`frontend/src/modules/refunds/RefundScreen.tsx`)

## Intención

El cajero necesita consultar un pedido completo, reimprimirlo y devolverlo sin riesgo de tocar la acción por accidente. Hoy la pantalla lista las últimas 50 ventas y pone **Devolver** en cada fila; no hay detalle, no se puede buscar una venta vieja y el límite de 50 es invisible.

## Objetivos

- Ver el detalle completo de un pedido en un panel lateral, sin salir de la lista.
- Devolver **solo desde el detalle**, en dos pasos: abrir detalle → confirmar motivo y medio.
- Reimprimir solo desde el detalle (una impresión accidental también cuesta papel).
- Encontrar pedidos por día, estado y código.
- Mostrar el historial completo con paginación visible, no truncado en 50.
- Mostrar la información de la devolución cuando ya existe.
- Exigir motivo de 5 a 200 caracteres, como pide `RF-REF-01` (hoy se acepta un carácter).

## No objetivos

- Pedidos del servidor o de otros dispositivos: la pantalla sigue usando solo IndexedDB local.
- Devoluciones parciales, edición o anulación de ventas.
- Reportes o agregación entre dispositivos.
- Dependencias nuevas.

## Restricciones

- Offline primero; todos los datos ya están en `sales`, `saleItems`, `payments`, `refunds` y `users`.
- Reutilizar `loadReceiptData` de `frontend/src/modules/printing/receipt.ts`.
- Mantener el layout `lg:grid-cols-[1fr_360px]` que ya usan Pedidos, Gastos y Administración.
- Pruebas con Vitest + Testing Library, base Dexie aislada por prueba.

## Enfoques considerados

1. **Panel lateral en la misma pantalla (elegido).** Reutiliza el layout actual y no agrega ruta ni modal. La lista y el detalle quedan visibles a la vez. Contra: el panel es angosto para pedidos largos; se resuelve con scroll interno.
2. **Modal amplio.** Da más ancho, pero oculta la lista y suma manejo de foco y Escape. Se descartó por costo sin beneficio claro en una caja fija.
3. **Ruta propia `/orders/:id`.** Permite enlace directo y botón atrás, pero es el mayor cambio y no aporta en el PC del local. Se descartó.

## Comportamiento

### Lista

- Filtros:
  - **Día:** por defecto el día operativo actual (`bogotaDate()`); el botón **Ver todo** quita el filtro.
  - **Estado:** Todas, Cobradas, Devueltas.
  - **Buscar:** texto contenido en el código, sin distinguir mayúsculas.
- Orden: `createdAt` descendente.
- Paginación: 50 filas, botón **Cargar más** mientras haya resultados.
- Columnas: Código, Fecha y hora, Tipo/Mesa, Total, Estado y **Ver**.
  - Tipo/Mesa usa las mismas etiquetas del comprobante (`Mostrador`, `Domicilio`, `Mesa 4`).
- Cabecera con el número de pedidos y la suma del conjunto filtrado.
- Estado vacío: "No hay pedidos para este filtro."
- La fila no expone **Imprimir** ni **Devolver**; solo **Ver**.

### Detalle

- Carga con `loadReceiptData` más la devolución (`refunds` por `saleId`).
- Muestra: código, estado, fecha y hora, tipo/mesa, cajero, ítems con cantidad, precio, modificadores, notas y total de línea, envío si aplica, total y pagos (medio y monto). Si no hay filas de `payments`, usa `sale.method`.
- Botones: **Imprimir comprobante** y, solo si está cobrada, **Devolver**.
- **Devolver** revela el formulario: motivo (5–200 caracteres), medio (Efectivo, Tarjeta, Bre-B), **Confirmar devolución** y **Cancelar**. No hay confirmación del navegador; el segundo paso ya es la confirmación.
- Al devolver: se actualiza la lista y el detalle; se muestra el monto devuelto; el botón desaparece.
- Si ya está devuelta: bloque con monto, medio, motivo y fecha de la devolución, sin botón de devolver.
- Errores visibles: sin turno abierto, venta ya devuelta, motivo inválido.

### Validación

- `refundSale`: motivo recortado, entre 5 y 200 caracteres; mensajes claros.
- Backend: `ShiftApplicationService.applyRefund` valida 5–200 caracteres; `SyncService.validate` valida lo mismo para rechazar la operación antes de abrir la transacción del lote (mismo patrón usado con el cambio de precio).

## Pruebas

- `refund-sale.test.ts`: rechaza 4 caracteres y acepta 5.
- `RefundScreen.test.tsx`:
  - el detalle muestra ítems, modificadores, mesa y pagos;
  - no hay botón **Devolver** en la lista;
  - devolver desde el detalle actualiza el estado y muestra el motivo;
  - imprimir se hace desde el detalle;
  - filtros por día, estado y código;
  - paginación y estado vacío.
- Backend: devolución con motivo corto rechazada en `applyRefund` y marcada `REJECTED` por sync.
- Verificación: `npm test`, `npm run build`, `./mvnw verify`.

## Lo que queda al constructor

- Clases y espaciado del panel, scroll interno y ancho exacto.
- Textos definitivos de filtros y mensajes.
- Decidir si la columna de fecha muestra solo la hora cuando el filtro es el día actual.
