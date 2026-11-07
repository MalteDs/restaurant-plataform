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

## Vender

1. En **Venta**, toca los productos del catálogo local.
2. Si el producto tiene modificadores, elige las opciones respetando el mínimo y el máximo.
3. Elige mostrador, domicilio (con envío) o mesa (con etiqueta).
4. Elige el pago: efectivo, tarjeta o Bre-B.
5. Toca **Cobrar**. La venta se guarda en el mismo instante junto con su operación pendiente.
6. El doble clic está bloqueado: un solo cobro por gesto.

## Devolver

1. En **Pedidos**, busca la venta y toca **Devolver**.
2. Escribe el motivo (obligatorio) y confirma.
3. La devolución es por el total de la venta y queda en el turno abierto actual.
4. Funciona sin conexión; se sincroniza después.

## Cerrar el turno

1. Ve a **Caja** y escribe el efectivo contado.
2. Toca **Cerrar turno**. La pantalla muestra el esperado y la diferencia.
3. La diferencia se registra, no se corrige sola. Si es distinta de cero, revisa ventas y devoluciones en efectivo.
4. Exporta el resumen del día con **Exportar CSV**.

## Gastos y administración

- **Reportes → Gastos** requiere conexión y rol gerente o administrador.
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
