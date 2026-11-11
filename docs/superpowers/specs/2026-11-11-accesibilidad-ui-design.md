# Accesibilidad y foco visible — Diseño

**Fecha:** 2026-11-11
**Rama:** `feat/mejoras-accesibilidad-ui`
**Alcance:** lote 1 de la revisión UX. No cambia flujos de negocio ni backend.

## Intención

La caja funciona, pero el contraste del naranja, el foco de teclado y los diálogos hacen que sea difícil de operar con teclado o con baja visión. La pantalla de bloqueo, además, no permite recuperarse de una sesión expirada.

## Decisiones

- **Contraste:** `brand-600` pasa a `#c2410c` (5.18:1 sobre blanco) y `brand-700` a `#9a3412` (7.31:1). `brand-500` queda para decoración.
- **Foco:** una regla global `:focus-visible` dibuja un contorno de 2px con offset en botones, enlaces, campos y elementos tabulables. El `Input` deja de anular el outline.
- **Diálogos:** se extrae `Modal` con `role="dialog"`, `aria-modal`, foco inicial, Escape, trampa de Tab, bloqueo de scroll y restauración de foco. Los tres diálogos de Venta lo usan.
- **Errores:** `FormError` con `role="alert"` reemplaza los párrafos visuales en Venta, Login, Bloqueo, Gastos, Pedidos, Administración y Recuperación.
- **Bloqueo:** botón **Iniciar sesión de nuevo** que cierra la sesión y navega a `/login`.
- **Pedidos:** la fila sigue abriendo el detalle con clic; el código es un botón real para teclado y lector de pantalla, conservando la semántica de tabla.

## No objetivos

- Lote 2: validación visible de modificadores, deshacer al quitar líneas, tamaños táctiles y feedback del carrito móvil.
- Lote 3: reportes por rango, estados vacíos, tablas responsive y pestañas de Administración con URL.
- Cambios de backend, migraciones o dependencias.

## Verificación

- `npm test` → 31 archivos, 123 pruebas, 0 fallos.
- `npm run build` correcto.
- Contraste calculado: `#c2410c` 5.18:1 y `#9a3412` 7.31:1 sobre blanco.
- Pruebas nuevas: `Modal` (foco/Escape/Tab), `FormError` (role alert), salida de Bloqueo y semántica de tabla en Pedidos.
