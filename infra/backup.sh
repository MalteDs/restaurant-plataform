#!/usr/bin/env bash
# Respaldo diario de PostgreSQL con retencion de 30 diarios y 12 mensuales.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/caja}"
CONTAINER="${POSTGRES_CONTAINER:-restaurant-proyect-postgres-1}"
DB_USER="${POSTGRES_USER:-caja}"
DB_NAME="${POSTGRES_DB:-caja}"
STAMP="$(date +%Y-%m-%d_%H%M%S)"
DAILY="$BACKUP_DIR/caja-$STAMP.sql.gz"

mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/monthly"

docker exec "$CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$DAILY"
gzip -t "$DAILY"
test -s "$DAILY"

cp "$DAILY" "$BACKUP_DIR/daily/"
if [ "$(date +%d)" = "01" ]; then
  cp "$DAILY" "$BACKUP_DIR/monthly/caja-$(date +%Y-%m).sql.gz"
fi

find "$BACKUP_DIR/daily" -name 'caja-*.sql.gz' -mtime +30 -delete
find "$BACKUP_DIR/monthly" -name 'caja-*.sql.gz' -mtime +372 -delete

echo "Respaldo verificado: $DAILY"
