# Runbook de recuperación — Caja v1

## 1. La caja no enciende o el navegador no abre

1. Usa otro equipo y abre la PWA con la misma URL.
2. Inicia sesión online con usuario y contraseña.
3. Abre **Caja** y verifica el turno. Si la caja anterior quedó con un turno abierto, ciérralo desde el servidor o continúa en el nuevo equipo.
4. Las ventas pendientes del equipo dañado no están en este equipo: usa el respaldo exportado (punto 3).

## 2. Se perdió el perfil del navegador (datos borrados)

1. Abre la PWA y entra a **Restaurar ventas pendientes** desde la pantalla de inicio de sesión.
2. Elige el archivo `.jsonl` más reciente exportado en **Recuperación**.
3. Confirma dos veces. La restauración es idempotente: puedes importar el mismo archivo varias veces sin duplicar.
4. Inicia sesión y verifica el indicador **Pendientes**; luego espera a **Al día**.
5. El respaldo incluye el token y el prefijo del dispositivo: al restaurarlo en el mismo equipo (o en un reemplazo) la cola continúa con la misma identidad. **No revoques el dispositivo anterior** hasta que la cola esté drenada.

## 3. Respaldo de las ventas pendientes

- En **Recuperación**, toca **Exportar pendientes**.
- Guarda el `.jsonl` en un lugar fuera del equipo (USB o nube).
- Si el navegador lo permite, elige una carpeta de respaldo: la app exporta cada 5 minutos.
- Exporta también antes de cerrar el turno y antes de cualquier mantenimiento.

## 4. Restaurar la base de datos (servidor)

1. Copia el respaldo diario `caja-YYYY-MM-DD_HHMMSS.sql.gz` al servidor.
2. Detén el backend.
3. Restaura en una base limpia:
   ```bash
   gunzip -c caja-2026-11-07_020000.sql.gz | docker exec -i <postgres> psql -U caja caja
   ```
4. Arranca el backend y verifica `GET /actuator/health`.
5. Abre la PWA, inicia sesión y confirma que el catálogo y los reportes coinciden.

## 5. Dispositivo revocado o token perdido

1. Un administrador entra a **Administración → Dispositivos**.
2. Registra un dispositivo nuevo con un código distinto (por ejemplo `B`).
3. Si el dispositivo anterior todavía tiene ventas pendientes, **no lo revoques**: exporta sus pendientes, restáuralos en el reemplazo (el respaldo conserva el token) y espera **Al día**. Después revócalo.
4. Si ya fue revocado, sus operaciones reciben 401 y la cola queda retenida: restaura el respaldo en un navegador limpio y pide al administrador que habilite el token anterior mientras se drena.

## 6. Sincronización atascada

- Revisa el indicador: **Error** significa que el servidor no respondió; la cola se reintenta con espera creciente.
- Verifica `GET /actuator/health` y que el backend tenga conexión a PostgreSQL.
- Si el error persiste, exporta los pendientes antes de cualquier reinicio.
- No borres IndexedDB ni el perfil del navegador.

## 7. Devolución de una venta de un turno cerrado

- La devolución queda en el turno actual, no en el turno original.
- El reporte del turno cerrado no cambia; la devolución aparece en el día en que se hizo.
