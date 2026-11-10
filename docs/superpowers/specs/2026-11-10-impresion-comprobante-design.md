# Impresión de comprobante para el cliente — Diseño

**Fecha:** 2026-11-10
**Estado:** propuesto para aprobación
**Alcance:** Caja v1, complemento posterior al plan de mejoras de operación.

## Intención

La encargada pidió imprimir la factura del cliente. Hoy el mesero toma el pedido a mano en una facturera y, al cobrar, la caja solo muestra el código de la venta y el cajero dice el total. El cliente no recibe ningún comprobante.

El objetivo es que, al terminar el cobro, el cajero pueda imprimir una tirilla con el detalle de lo vendido usando la impresora térmica que ya está en el local. La cocina no usa comandas impresas; el papel es solo para el cliente.

## Objetivos

- Imprimir un comprobante legible en la impresora térmica del local al momento del cobro.
- Lanzar el diálogo de impresión automáticamente al terminar el cobro, con un botón visible para reimprimir.
- Permitir reimprimir una venta después, desde Pedidos.
- Funcionar sin internet, con los datos que ya están en la base local.
- No bloquear ni afectar la venta si la impresora falla.

## No objetivos

- Comanda para cocina o copia adicional para el negocio.
- Facturación electrónica DIAN, NIT, resolución, numeración fiscal ni impuestos.
- Impresión silenciosa sin el diálogo del navegador.
- Abrir el cajón monedero, cortar papel por comando o enviar ESC/POS directo.
- Guardar PDF o archivar el comprobante.
- Imprimir desde las tablets Android en esta iteración; el equipo objetivo es el PC de caja con Windows y Edge.

## Antígoal

Que la impresora se vuelva un requisito para vender. Si no hay impresora, está apagada o el driver falla, la venta debe quedar guardada y el cajero debe poder seguir cobrando.

## Restricciones

- La caja es una PWA offline-first: todo se lee de IndexedDB.
- El navegador imprime con el driver de Windows; la app no controla el hardware.
- No se agregan dependencias.
- El ancho de la tirilla (58 u 80 mm) aún no se conoce. El diseño debe funcionar con ambos sin configuración inicial.
- El PC objetivo tiene 2 GB de memoria; el comprobante debe ser liviano.

## Enfoques considerados

### A. Imprimir desde el navegador con una tirilla HTML (elegido)

Se arma el HTML del comprobante con los datos locales, se carga en un `iframe` oculto y se llama `window.print()` sobre ese iframe. El diálogo de impresión del navegador aparece; el cajero confirma.

- Ventajas: sin dependencias, funciona sin internet, usa cualquier impresora instalada, estilos aislados del resto de la app, no abre pestañas.
- Desventajas: aparece el diálogo del navegador; los márgenes dependen del driver.

### B. Comandos ESC/POS por WebUSB o Web Serial

Impresión silenciosa y control del corte y del cajón.

- Desventajas: permisos por equipo, solo Chromium, la impresora debe aceptar comandos crudos, conflictos con el driver de Windows y mucho más código. Descartado por desproporcionado.

### C. Generar PDF y mandarlo a imprimir

- Desventajas: suma una dependencia, es más lento en el PC de 2 GB y de todos modos obliga a abrir el diálogo. Descartado.

## Decisiones

1. **Mecanismo:** enfoque A, tirilla HTML en un `iframe` oculto con `window.print()`.
2. **Disparo:** automático. Al terminar el cobro se lanza el diálogo de impresión y, al mismo tiempo, el panel de confirmación muestra el código y un botón **Imprimir comprobante** para reimprimir si el cajero canceló el diálogo o la tirilla salió mal. Un fallo de impresora nunca interrumpe ni revierte la venta.
3. **Reimpresión:** botón **Imprimir** en cada fila de Pedidos (`/orders`), que ya lista las ventas del día.
4. **Ancho:** la tirilla usa ancho fluido, `@page { margin: 2mm }` y fuente del sistema. No se fija 58 ni 80 mm: el tamaño de papel lo define el driver de la impresora. Si en la prueba real no se ve bien, se agrega después un selector por equipo; no forma parte de esta iteración.
5. **Título:** “Comprobante de venta”. No se usa “Factura” para no aparentar una factura electrónica. Es un cambio de una palabra si la encargada prefiere “Factura”.
6. **Contenido:**
   - Encabezado: `KARBÓN` y el nombre de la sede si está guardado localmente; si no, el código del dispositivo (`ALM-A`).
   - Código de venta, fecha y hora en hora de Bogotá, tipo (Mostrador / Domicilio / Mesa N) y cajero.
   - Líneas: cantidad, producto, modificadores con su precio adicional, nota de la línea y total de la línea.
   - Envío, cuando aplica.
   - Total.
   - Medios de pago con su monto (incluye pagos divididos).
   - Pie: “Gracias por su visita”.
   - Sin NIT, dirección, resolución DIAN ni datos fiscales.
7. **Sede:** el nombre se guarda en `meta.locationName` cuando el admin abre Configuración. No se agrega una llamada de red nueva; si no está, el comprobante usa el código del dispositivo.
8. **Fallo de impresión:** se captura y se muestra “No se pudo imprimir. La venta quedó guardada.” La venta no se revierte ni se marca con error.
9. **Datos:** se leen de `sales`, `saleItems`, `payments` y `users` por `saleId`. El nombre del cajero sale de `users.username`.
10. **Formato:** montos con `toLocaleString('es-CO')`, fecha con `America/Bogota`, todo el texto dinámico escapado antes de insertarlo en el HTML.

## Archivos previstos

- Crear: `frontend/src/modules/printing/receipt.ts` — cargar datos, construir HTML y disparar la impresión.
- Crear: `frontend/src/modules/printing/receipt.test.ts` — pruebas del contenido, escapado y datos.
- Modificar: `frontend/src/modules/sales/SaleScreen.tsx` — panel de venta guardada con botón de impresión.
- Modificar: `frontend/src/modules/sales/SaleScreen.test.tsx`.
- Modificar: `frontend/src/modules/refunds/RefundScreen.tsx` — botón de reimpresión.
- Modificar: `frontend/src/modules/refunds/RefundScreen.test.tsx`.
- Modificar: `frontend/src/modules/admin/SettingsScreen.tsx` — guardar `locationName` en `meta`.

## Verificación

- Pruebas unitarias del HTML: incluye código, líneas, modificadores, notas, envío, total, pagos y sede; escapa `<`, `>`, `&` y comillas; omite la sede si no está guardada.
- Pruebas de interfaz: al cobrar se llama al servicio de impresión con el `saleId` y aparece **Imprimir comprobante**; el botón vuelve a llamar al servicio. Si la impresión falla, el mensaje de venta guardada permanece. En Pedidos, **Imprimir** llama al servicio con la venta seleccionada.
- `npm test` y `npm run build` en `frontend/`.
- Prueba manual en el PC del local: imprimir una venta real en la térmica, revisar legibilidad, ancho, márgenes y que el diálogo recuerde la impresora. Ajustar el CSS si el papel es de 58 mm.

## Lo que queda al plan

- Nombres exactos de funciones y firmas.
- Orden de las tareas y pruebas.
- Detalle del HTML/CSS de la tirilla.
- Prueba manual en el equipo real.

## Decisiones cerradas con el usuario

- El diálogo de impresión sale automáticamente al terminar el cobro, y además queda el botón **Imprimir comprobante**.
- El título del papel es **Comprobante de venta**.
- La reimpresión desde Pedidos se mantiene.
