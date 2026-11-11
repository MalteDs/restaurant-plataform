# Manual de operación — Caja v1

## Antes de abrir

- Verifica que la caja tenga la PWA abierta y el indicador **Al día** o **Sin conexión**.
- La caja funciona sin internet; las ventas quedan pendientes hasta que vuelva la red.
- No borres los datos del navegador: ahí viven las ventas pendientes.

## Iniciar sesión y turno

1. Ingresa usuario, contraseña y un PIN de 4 a 6 dígitos.
   - El PIN es local: al bloquear la caja se desbloquea con él.
   - Si pasan más de 7 días sin conexión, el PIN deja de servir y hay que iniciar sesión online.
2. Ve a **Caja** y abre el turno con el fondo inicial en efectivo.
3. Si el equipo es nuevo, un administrador debe registrarlo en **Administración → Dispositivos** desde ese mismo navegador. El token del dispositivo se guarda solo y es el que permite sincronizar.

## Movimientos de caja

- Con el turno abierto, toca **Registrar movimiento**, elige **Ingreso** o **Retiro**, y escribe monto y motivo (5 a 200 caracteres).
- Para un gasto pagado con efectivo de la caja, elige **Retiro**, marca **Es gasto** y elige la categoría. El gasto baja el efectivo esperado y aparece en Reportes.
- Un movimiento se puede **Editar** o **Anular** mientras el turno esté abierto. El movimiento viejo queda anulado con usuario y fecha; no se borra.
- Al cerrar el turno ya no se edita ni se anula.

## Vender

1. En **Venta**, toca los productos del catálogo local.
2. Si el producto tiene modificadores, elige las opciones respetando el mínimo y el máximo.
3. Elige mostrador, domicilio (con envío) o mesa (con etiqueta).
4. Elige el pago: efectivo, tarjeta o Bre-B.
   - Para pago combinado toca **Dividir pago**, ajusta el monto de la primera parte y agrega las demás. El botón **Cobrar** solo se habilita cuando **Restante** llega a $0.
   - El arqueo del turno suma únicamente las porciones pagadas en efectivo.
5. Toca **Cobrar**. La venta se guarda en el mismo instante junto con su operación pendiente.
6. El doble clic está bloqueado: un solo cobro por gesto.

## Promociones por día

- Un producto o combo puede limitarse a ciertos días de la semana (1=lunes … 7=domingo).
- Fuera de esos días no aparece en la pantalla de venta.
- Se configura en **Administración → Catálogo**, columna **Días**. Vacío significa todos los días.
- Los precios de promoción no vienen precargados: el administrador define el precio y los días del combo.

## Cambiar el precio de una línea

- Solo un **Encargado** o **Administrador** ve el botón **Cambiar precio** en el carrito.
- El nuevo precio debe ser un entero mayor o igual a 0 y el motivo debe tener entre 5 y 200 caracteres.
- La venta guarda el precio de lista, el precio aplicado, el motivo y el usuario que autorizó.
- Funciona sin conexión; el servidor revalida el rol y el motivo al sincronizar.

## Devolver

1. En **Pedidos**, busca la venta y toca **Devolver**.
2. Escribe el motivo (obligatorio), elige el **Medio de devolución** y confirma.
3. La devolución es por el total de la venta y queda en el turno abierto actual.
4. Si devuelves en efectivo, el efectivo esperado del turno baja por el total; si devuelves por tarjeta o Bre-B, no afecta el arqueo.
5. Funciona sin conexión; se sincroniza después.

## Cerrar el turno

1. Ve a **Caja** y cuenta los billetes y monedas por denominación.
2. El total contado se calcula solo. Si hay diferencia, escribe una nota de 5 a 200 caracteres.
3. Toca **Cerrar turno**. La pantalla muestra el esperado, el contado y la diferencia.
4. El esperado suma el fondo inicial, las porciones en efectivo de las ventas, los ingresos y resta las devoluciones en efectivo, los retiros y los gastos de caja. Los pagos con tarjeta o Bre-B no entran al arqueo.
5. En **Turnos anteriores**, descarga el cierre en CSV con **Descargar cierre**.
6. El resumen diario y su exportación viven en **Reportes**.

## Gastos y administración

- **Caja** la puede operar cualquier usuario autenticado: abrir, mover, editar, anular y cerrar.
- **Reportes → Gastos** requiere conexión y rol gerente o administrador. Ahí se registran los gastos pagados por fuera de la caja.
- Los gastos pagados con caja se registran desde **Caja** y aparecen en Reportes una vez sincronizados. Se editan o anulan desde Caja, no desde Reportes.
- Cada gasto exige una categoría activa. El administrador las crea y activa en **Administración → Configuración → Categorías de gasto**.
- El reporte muestra **Gastos por categoría** con el nombre con el que se registró cada gasto; renombrar una categoría no reescribe el histórico.
- **Administración** (catálogo, usuarios, dispositivos, sede) requiere conexión y rol administrador.
- Cambiar un precio no altera ventas anteriores: el precio se congela al vender.

## Sincronización

- El indicador del encabezado muestra **Pendientes**, **Sincronizando**, **Error**, **Al día** o **Sin conexión**.
- La cola se envía sola al recuperar la red, al volver a la pestaña y cada 30 segundos.
- Si ves **Error**, revisa la conexión. Las operaciones no se borran.
- Un dispositivo revocado recibe 401 y la cola queda retenida: no borres los datos; contacta al administrador.

## Qué no hacer

- No uses el modo incógnito para operar.
- No borres el perfil del navegador sin exportar los pendientes antes.
- No cierres el turno de dos dispositivos a la vez.
