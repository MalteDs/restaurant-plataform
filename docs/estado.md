# Estado de implementación — Caja v1

**Última actualización:** 2026-11-06
**Fase:** Tarea 2 completada (esquema multi-tenant, dinero y aislamiento).
**Tarea en curso:** ninguna; Tarea 3 (identidad y autenticación) lista para iniciar.
**Último commit de implementación:** `ee6a1c6` (`chore: spring boot modular monolith skeleton with postgres`).
**Modelo de datos:** `docs/superpowers/specs/2026-11-06-modelo-datos-design.md` (aprobado 2026-11-06).
**Bloqueos:** ninguno.

## Progreso

- [x] Tarea 1 — Monolito modular, PostgreSQL y salud
- [x] Tarea 2 — Esquema multi-tenant, auditoría y dinero
- [x] Tarea 3 — Identidad, dispositivos y autenticación
- [x] Tarea 4 — Catálogo
- [x] Tarea 5 — Ventas, turnos y pedidos en el servidor
- [x] Tarea 6 — Sync API idempotente
- [ ] Tarea 7 — Reportes centrales, gastos y auditoría
- [ ] Tarea 8 — Shell PWA, service worker y navegación
- [ ] Tarea 9 — Base local, catálogo y sesión offline
- [ ] Tarea 10 — Venta offline con carrito y pago
- [ ] Tarea 11 — Motor de sincronización
- [ ] Tarea 12 — Cierre de turno, reportes locales y CSV
- [ ] Tarea 13 — Devoluciones, gastos y administración
- [ ] Tarea 14 — Recuperación: exportar y restaurar pendientes
- [ ] Tarea 15 — E2E offline, despliegue y documentación

## Notas de la sesión

- Tarea 1 revisada y aprobada por `opencode-go/deepseek-v4.1-flash`, modelo liviano elegido explícitamente por el usuario.
- `./mvnw test -Dtest=HealthIT` y `./mvnw verify`: 1 prueba, 0 fallos, 0 errores y sin advertencias.
- La prueba de salud verifica el estado agregado y `components.db.status = UP`; su aserción adicional tuvo RED controlada y luego GREEN.
- `infra/docker-compose.yml` valida con `docker compose config`. Falta su smoke test de arranque porque `postgres-carga-docente` ocupa el puerto 5432; no se modificó ese servicio.
- Menores diferidos de revisión: detalles de salud con `show-details: always` y comentario explicativo para el override de Testcontainers.
- Modelo de datos relacional normalizado aprobado por el usuario: 23 tablas, dinero en `bigint`, FKs compuestas para aislar tenant y sede.
- Decisiones de negocio cerradas: modificadores por unidad, solo devoluciones completas y código de dispositivo nuevo al re-provisionar.
- El plan se ajustó al modelo aprobado: precios congelados desde la caja, `sale_item_components`, `refunds.shift_id` y `sync_operations.clock_skew`.
- Tarea 3: login/refresh con JWT (15 min) y refresh opaco rotado (30 días), BCrypt, registro y revocacion de dispositivos, filtros `JwtAuthFilter` y `DeviceTokenFilter`.
- Tarea 3: `JWT_SECRET` es obligatorio fuera del perfil `local`; el compose y la documentacion de despliegue deben definirlo.
- Tarea 4: catalogo con version, seed del menu de Karbon (9 categorias, 75 productos) y endpoints admin con validacion.
- Tarea 5: venta con precios congelados de la caja, pago unico, pedido 1:1, turno abierto por dispositivo y devolucion completa.
- Tarea 6: `POST /api/sync/operations` con `APPLIED|DUPLICATE|RETRY|REJECTED`, orden por `seq` y `payload_hash` para detectar cambios.
- Siguiente paso concreto: iniciar la Tarea 7 (reportes centrales, gastos y auditoria).

## Decisiones pendientes

- Proveedor de nube (sujeto a cambios; no bloquea hasta la Tarea 15).
- Costo por producto para utilidad exacta (opcional).
- PC de reemplazo (procedimiento documentado, sin hardware).
