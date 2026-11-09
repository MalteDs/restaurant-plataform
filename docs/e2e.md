# E2E con Playwright

Las pruebas E2E usan el backend real (Spring Boot + PostgreSQL) y una base dedicada. No tocan producción.

## Requisitos

- Node y `npm`.
- Docker.
- Java 21 (`JAVA_HOME` o `/usr/lib/jvm/java-21-openjdk`).

## Instalación

```bash
cd frontend
npm ci
npm run e2e:install
```

## Ejecutar

```bash
cd frontend
npm run e2e
```

`playwright.config.ts` levanta automáticamente:

1. PostgreSQL E2E en el contenedor `caja-e2e-db`, puerto `127.0.0.1:5434` (separado del PostgreSQL de desarrollo en `5433`).
2. El backend E2E en `127.0.0.1:8081` mediante `infra/e2e-backend.sh`.
3. El frontend compilado en `127.0.0.1:4173` con `vite preview`.

El script del backend recrea la base **`caja_e2e`** (no toca `caja8` ni el backend de desarrollo en `:8080`), aplica Liquibase y crea el usuario `admin` / `caja123`. El usuario de E2E vive en el changeset `020-e2e-admin.yaml`, que solo corre con el contexto `e2e`; en producción y en las pruebas del backend queda filtrado.

## Reutilización

Si ya hay un backend E2E respondiendo en `:8081`, Playwright lo reutiliza y no recrea la base. El backend de desarrollo en `:8080` es independiente y no se reinicia ni se borra.

Variables opcionales del entorno E2E:

| Variable | Default |
|---|---|
| `E2E_DB_CONTAINER` | `caja-e2e-db` |
| `E2E_DB_PORT` | `5434` |
| `E2E_DB_NAME` | `caja_e2e` |
| `E2E_BACKEND_PORT` | `8081` |
| `E2E_JWT_SECRET` | secreto local de pruebas |

## Suites

- `e2e/shell.spec.ts`: shell PWA y carga offline.
- `e2e/offline.spec.ts`: venta offline, cierre de turno, sincronización y recuperación.
- `e2e/improvements.spec.ts`: agrupación de variantes, eliminación del carrito, reporte local y carrito móvil.
- `e2e/console-audit.spec.ts`: captura `console.error`, `console.warn`, excepciones y peticiones fallidas en el flujo principal; falla si aparece ruido inesperado en consola.
- `e2e/session-expiry.spec.ts`: con un token inválido hace un solo refresh y vuelve a login sin dejar la sesión pegada.

## Resultados

```bash
npx playwright show-report
```

Cada corrida usa códigos de dispositivo únicos, así que se puede repetir sin recrear la base.

## Ruido de consola del navegador

Si aparece:

```text
Uncaught (in promise) Error: A listener indicated an asynchronous response by returning true,
but the message channel closed before a response was received
```

en rutas como `sale:1` o `lock:1`, no viene de la aplicación. Es una extensión de Chrome/Edge (gestor de contraseñas, traductor, bloqueador, MetaMask, etc.) que abre un canal de mensajes y no lo cierra. En Linux, **GNOME Shell integration** es una fuente típica de este mensaje. Desactiva las extensiones o prueba en un perfil limpio/incógnito. La auditoría E2E corre sin extensiones y no lo reproduce.
