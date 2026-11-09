#!/usr/bin/env bash
set -euo pipefail

# Dedicated E2E database. Never point these at production.
CONTAINER="${E2E_DB_CONTAINER:-caja-e2e-db}"
DB_PORT="${E2E_DB_PORT:-5434}"
DB_NAME="${E2E_DB_NAME:-caja_e2e}"
BACKEND_PORT="${E2E_BACKEND_PORT:-8081}"
JWT_SECRET="${E2E_JWT_SECRET:-caja-e2e-cambiar-este-secreto-0123456789abcdef}"

if curl -fsS "http://127.0.0.1:${BACKEND_PORT}/actuator/health" >/dev/null 2>&1; then
  echo "Ya hay un backend E2E en ${BACKEND_PORT}; se reutiliza."
  exit 0
fi

if [ -z "${JAVA_HOME:-}" ] || ! "$JAVA_HOME/bin/java" -version 2>&1 | grep -q 'version "21'; then
  for candidate in /usr/lib/jvm/java-21-openjdk /usr/lib/jvm/java-21-openjdk-*; do
    if [ -x "$candidate/bin/java" ]; then
      export JAVA_HOME="$candidate"
      break
    fi
  done
fi
if [ -z "${JAVA_HOME:-}" ]; then
  echo "Se requiere Java 21 (define JAVA_HOME)." >&2
  exit 1
fi

if ! docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  docker run -d --name "$CONTAINER" \
    -e POSTGRES_DB="$DB_NAME" -e POSTGRES_USER=caja -e POSTGRES_PASSWORD=caja \
    -p "127.0.0.1:${DB_PORT}:5432" postgres:16 >/dev/null
elif ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  docker start "$CONTAINER" >/dev/null
fi

for _ in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U caja -d postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Clean e2e database so each started backend has the menu seed and no old devices.
docker exec "$CONTAINER" psql -U caja -d postgres -v ON_ERROR_STOP=1 \
  -c "drop database if exists $DB_NAME with (force);" \
  -c "create database $DB_NAME;" >/dev/null

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
JAR="$ROOT/backend/target/caja-backend-0.0.1-SNAPSHOT.jar"
if [ ! -f "$JAR" ] || find "$ROOT/backend/src" -newer "$JAR" -print -quit | grep -q .; then
  (cd "$ROOT/backend" && ./mvnw -q -DskipTests package)
fi

cd "$ROOT/backend"
echo "Backend E2E listo en http://127.0.0.1:${BACKEND_PORT}"
exec env DB_URL="jdbc:postgresql://127.0.0.1:${DB_PORT}/${DB_NAME}" \
  DB_USERNAME=caja DB_PASSWORD=caja JWT_SECRET="$JWT_SECRET" \
  SERVER_PORT="$BACKEND_PORT" SPRING_LIQUIBASE_CONTEXTS=e2e \
  "$JAVA_HOME/bin/java" -jar "$JAR"
