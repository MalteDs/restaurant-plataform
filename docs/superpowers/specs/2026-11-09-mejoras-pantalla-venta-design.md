# Mejoras de la pantalla de venta — diseño

**Fecha:** 2026-11-09
**Tamaño:** cambio pequeño (una pantalla).

## Intención

En el mostrador hoy se usa un cuaderno de facturas: nadie busca productos en la app
todavía y los precios se leen del menú. La caja debe permitir agregar productos rápido:
repetir un producto suma unidades, y encontrar algo entre ~75 ítems debe ser posible
recorriendo categorías sin perder la vista completa del catálogo.

## Objetivos

- Repetir un producto con los mismos modificadores suma cantidad en la misma línea.
- Navegar por categorías sin ocultar el resto del catálogo.
- Filtrar por nombre mientras se escribe.
- Ver en el carrito los modificadores elegidos.
- Tarjetas más cómodas de tocar en tablet y móvil.

## No objetivos

- Imágenes, favoritos, productos recientes ni atajos de teclado.
- Cambios de backend, modelo de datos o sincronización.
- El error de consola `A listener indicated an asynchronous response…`: proviene de una
  extensión del navegador, no del código de la app.

## Restricciones

- React 18 + Tailwind existentes; sin dependencias nuevas.
- Se conservan precios congelados, cambio de precio autorizado, pagos divididos y turnos.
- `npm test` y `npm run build` deben pasar.

## Enfoques considerados

1. **Pestañas por categoría** que ocultan el resto. Descartado: el usuario quiere poder
   ver todo sin recorrer categoría por categoría.
2. **Todas las secciones visibles + chips que saltan a la categoría** (elegido). Simple,
   sin estado de navegación ni scroll-spy.
3. **Solo buscador.** Descartado como solución única: hoy no se busca por nombre.

## Decisiones

- `addLine` fusiona la línea existente cuando coinciden `product.id` y el conjunto de IDs
  de modificadores, y la línea no tiene precio cambiado a mano. Suma cantidad con tope 99.
  Si el precio fue cambiado, se agrega una línea nueva para no aplicar ese precio a la
  unidad nueva.
- Chips de categoría pegados bajo el encabezado; al tocarlos hacen scroll a la sección.
  Todas las secciones siguen renderizadas.
- Buscador por nombre, insensible a mayúsculas. Con texto, oculta categorías sin
  coincidencias y muestra un aviso si no hay resultados.
- El carrito lista los modificadores bajo el nombre del producto.
- Tarjetas con mayor área de toque y un `+` visible. Se mantiene
  `Desde $… · N opciones` para familias con variantes.
- No se reordena el catálogo: se conserva el orden actual de categorías y productos.

## Archivos previstos

- `frontend/src/modules/sales/SaleScreen.tsx` — fusión de líneas, chips, buscador,
  modificadores en el carrito y estilos de tarjeta.
- `frontend/src/modules/sales/SaleScreen.test.tsx` — pruebas de fusión, modificadores
  distintos y filtro.

## Lo que queda para el plan

Pasos TDD, pruebas exactas y comandos de verificación.
