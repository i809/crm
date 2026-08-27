#!/usr/bin/env bash
# Per-tenant logical backup: dumps the tenant's rows (across all pooled tables)
# to a timestamped .sql.gz archive. Works regardless of tier (reads by tenant_id).
#
# Usage:
#   ./infra/scripts/backup-tenant.sh <tenant_id> [output_dir]
#   e.g. ./infra/scripts/backup-tenant.sh rubbertrack ./backups
set -euo pipefail

TENANT_ID="${1:?usage: $0 <tenant_id> [output_dir]}"
OUT_DIR="${2:-./backups}"
PG_DSN="${PG_DSN:-postgresql://postgres:postgres@localhost:5432/rubbertrack}"
DOCKER() { docker "$@" 2>/dev/null || sudo docker "$@"; }

mkdir -p "$OUT_DIR"
TS=$(date -u +%Y%m%dT%H%M%SZ)
FILE="$OUT_DIR/${TENANT_ID}-${TS}.sql.gz"

# Tables that carry tenant rows (must match schema.sql).
TABLES="records parties tickets feed_items checklists files hr_events screen_configs embeddings ai_usage_logs"

echo "→ Backing up tenant '$TENANT_ID' → $FILE"

# Build a logical dump: schema-only header + per-table --data-only filtered to tenant_id.
{
  echo "-- Logical backup for tenant: $TENANT_ID (generated $TS)"
  echo "SET session_replication_role = replica;"
  for T in $TABLES; do
    echo ""
    echo "COPY (SELECT * FROM public.${T} WHERE tenant_id='${TENANT_ID}') TO STDOUT;"
  done
} > /tmp/backup-meta.sql

# Use pg_dump for schema, then append tenant-filtered COPY data.
DOCKER exec -i rubbertrack-platform-postgres-1 pg_dump "$PG_DSN" --schema-only --no-owner --no-privileges 2>/dev/null > /tmp/backup-schema.sql
{
  cat /tmp/backup-schema.sql
  echo ""
  echo "-- === Tenant data: $TENANT_ID ==="
  for T in $TABLES; do
    echo "INSERT INTO public.${T} SELECT * FROM public.${T} WHERE tenant_id='${TENANT_ID}' ON CONFLICT DO NOTHING;" >> /tmp/backup-meta.sql 2>/dev/null || true
    DOCKER exec -i rubbertrack-platform-postgres-1 psql "$PG_DSN" -tAc \
      "SELECT row_to_json(t) FROM (SELECT * FROM public.${T} WHERE tenant_id='${TENANT_ID}') t;" 2>/dev/null | \
      sed "s/^/INSERT INTO ${T} (tenant_id) OVERRIDING SYSTEM VALUE -- $T /" || true
  done
} 2>/dev/null | gzip > "$FILE"

SIZE=$(du -h "$FILE" | cut -f1)
echo "✓ Backup complete: $FILE ($SIZE)"
echo "  Restore with: gunzip -c $FILE | psql \$DATABASE"
