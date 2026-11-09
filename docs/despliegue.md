# Despliegue — Caja v1

## Desarrollo local

Desde la raíz del repositorio:

```bash
make up      # PostgreSQL + backend + frontend
make logs    # ver logs de los tres servicios
make restart # recompila y reinicia el backend tras cambiar Java
make down    # apagar todo (conserva la base)
```

- Usuario inicial: `admin` / `caja123`. Lo crea el changeset `020-e2e-admin.yaml`, que solo corre en desarrollo (`LIQUIBASE_CONTEXTS=e2e`). El PIN del login (4-6 dígitos) lo eliges tú; no lo valida el servidor.
- Frontend en http://localhost:5173 (recarga automática).
- Backend en http://localhost:8080.
- PostgreSQL en `127.0.0.1:5433` (`POSTGRES_PORT` lo cambia), porque el 5432 suele estar ocupado por otro PostgreSQL.
- La primera vez tarda porque descarga imágenes y dependencias de Maven/npm; después arranca en segundos.
- Cambios en el frontend se recargan solos. Cambios en el backend requieren `make restart`.
- `docker compose -f infra/docker-compose.yml down -v` borra también la base.

## Requisitos

- Docker y Docker Compose.
- Un dominio o IP para TLS. Caddy obtiene el certificado automáticamente con un dominio real.
- Variables de entorno obligatorias:
  - `POSTGRES_PASSWORD`
  - `JWT_SECRET` (mínimo 32 caracteres, secreto real; no uses el de desarrollo)
  - `DOMAIN` (por ejemplo `caja.karbon.co`)

## Build del frontend

El contenedor de Caddy sirve `frontend/dist` como volumen. Compílalo antes de levantar:

```bash
cd frontend
npm ci
npm run build
cd ..
```

## Levantar

```bash
cd infra
cat > .env <<'ENV'
POSTGRES_PASSWORD=cambia-esto
JWT_SECRET=cambia-esto-por-un-secreto-de-32-o-mas-caracteres
DOMAIN=caja.ejemplo.com
ENV
docker compose -f docker-compose.prod.yml up -d --build
```

Servicios:

- `postgres`: PostgreSQL 16 con volumen `caja-db`.
- `backend`: Spring Boot, Liquibase aplica el esquema y el seed del menú al arrancar.
- `caddy`: TLS automático, sirve la SPA y hace proxy a `/api` y `/actuator`.

Verifica:

```bash
curl https://$DOMAIN/actuator/health
```

## Primer usuario

El seed no crea usuarios. Crea el primer administrador una vez:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U caja -d caja <<'SQL'
insert into users(id, tenant_id, location_id, username, password_hash, role)
values (gen_random_uuid(),
        '00000000-0000-4000-8000-0000000003e9',
        '00000000-0000-4000-8000-0000000003ea',
        'admin',
        '$2b$10$1.4NaIDIr9xk6AEoK7JjXO6jJHGR3Y0Qox/ddtGy2l.WmXCvInadq',
        'ADMIN');
SQL
```

La contraseña de ese hash de ejemplo es `caja123`: cámbiala inmediatamente desde **Administración → Usuarios** o genera un hash nuevo.

## Respaldos

```bash
chmod +x infra/backup.sh
# cron diario a las 02:00
0 2 * * * POSTGRES_CONTAINER=<nombre-del-contenedor> /ruta/infra/backup.sh >> /var/log/caja-backup.log 2>&1
```

El script guarda diarios 30 días y mensuales 12 meses, y verifica el `.gz` antes de darlo por bueno.

## Actualizar la aplicación

```bash
git pull
cd frontend && npm ci && npm run build && cd ..
cd infra
docker compose -f docker-compose.prod.yml up -d --build
```

Liquibase aplica solo los cambios nuevos. **No edites un changelog ya aplicado**: agrega `NNN-...yaml` y regístralo en `db.changelog-master.yaml`.

## Nota sobre proveedores

Vercel solo sirve la PWA: no ejecuta Spring Boot ni PostgreSQL. Si se elige Vercel para el frontend, el backend va a Railway/Render/Fly y la base a Neon/Supabase; el `docker-compose.prod.yml` sigue siendo la referencia portable.

## Variables del backend

| Variable | Uso | Default |
|---|---|---|
| `DB_URL` | JDBC de PostgreSQL | `jdbc:postgresql://localhost:5432/caja` |
| `DB_USERNAME` | Usuario de base | `caja` |
| `DB_PASSWORD` | Contraseña de base | `caja` |
| `JWT_SECRET` | Firma de tokens (obligatorio) | sin default |
| `JWT_ACCESS_TTL_MINUTES` | Vida del access token | `15` |
| `JWT_REFRESH_TTL_DAYS` | Vida del refresh token | `30` |
