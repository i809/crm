#!/usr/bin/env bash
# Escalate a tenant from tier A (pooled RLS) → B (schema-per-tenant) → C (db-per-tenant).
# Moves the tenant's rows out of the pooled tables into an isolated schema/database.
# Idempotent + reversible-ish: re-running on the same tier is a no-op.
#
# Usage:
#   ./infra/scripts/escalate-tenant.sh <tenant_id> <to_tier>
#   e.g. ./infra/scripts/escalate-tenant.sh acme B
#        ./infra/scripts/escalate-tenant.sh acme C
set -euo pipefail

TENANT_ID="${1:?usage: $0 <tenant_id> <to_tier B|C>}"
TO_TIER="${2:?tier required: B (schema-per-tenant) or C (db-per-tenant)}"
PG_DSN="${PG_DSN:-postgresql://postgres:postgres@localhost:5432/rubbertrack}"
DOCKER() { docker "$@" 2>/dev/null || sudo docker "$@"; }

if [ "$TO_TIER" != "B" ] && [ "$TO_TIER" != "C" ]; then
  echo "✗ tier must be B or C"; exit 1
fi

CURRENT=$(DOCKER exec -i rubbertrack-platform-postgres-1 psql "$PG_DSN" -tAc \
  "SELECT tier FROM app.tenants WHERE id='$TENANT_ID';")
echo "→ Tenant '$TENANT_ID' current tier: $CURRENT → target: $TO_TIER"

if [ "$CURRENT" = "$TO_TIER" ]; then echo "  already at tier $TO_TIER — nothing to do"; exit 0; fi
if [ "$CURRENT" = "C" ]; then echo "  ✗ cannot escalate from C (already max)"; exit 1; fi

# Tables that carry tenant rows (must match schema.sql).
TABLES="records parties tickets feed_items checklists files hr_events screen_configs embeddings ai_usage_logs"

if [ "$TO_TIER" = "B" ]; then
  # Tier B: CREATE SCHEMA, copy the tenant's rows into per-table copies in that schema.
  SCHEMA="tenant_${TENANT_ID}"
  echo "→ Creating schema $SCHEMA and copying tenant rows..."
  DOCKER exec -i rubbertrack-platform-postgres-1 psql "$PG_DSN" -v ON_ERROR_STOP=1 <<SQL
CREATE SCHEMA IF NOT EXISTS $SCHEMA;
-- For each table: create a same-shape table in the tenant schema (no tenant_id
-- column needed — the schema IS the boundary), copy this tenant's rows.
SQL
  for T in $TABLES; do
    DOCKER exec -i rubbertrack-platform-postgres-1 psql "$PG_DSN" -v ON_ERROR_STOP=1 <<SQL
CREATE TABLE IF NOT EXISTS ${SCHEMA}.${T} (LIKE public.${T} INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
INSERT INTO ${SCHEMA}.${T} SELECT * FROM public.${T} WHERE tenant_id='$TENANT_ID'
  ON CONFLICT DO NOTHING;
SQL
    echo "  ✓ copied $T → ${SCHEMA}.${T}"
  done
  echo "  (rows remain in pooled tables too — run cleanup-pool.sh to purge after cutover)"

elif [ "$TO_TIER" = "C" ]; then
  # Tier C: CREATE DATABASE, dump the tenant's rows into it.
  DB_NAME="tenant_${TENANT_ID}"
  echo "→ Creating database $DB_NAME and copying tenant rows..."
  DOCKER exec -i rubbertrack-platform-postgres-1 psql "$PG_DSN" -v ON_ERROR_STOP=1 -c "CREATE DATABASE $DB_NAME;" || echo "  (db may already exist — continuing)"
  # Apply the same schema + extensions into the new DB, then copy tenant rows.
  DOCKER exec -i rubbertrack-platform-postgres-1 psql "$PG_DSN" -tAc \
    "SELECT 'pg_terminate_backend('||pid||')' FROM pg_stat_activity WHERE datname='$DB_NAME';" | \
    DOCKER exec -i rubbertrack-platform-postgres-1 psql "$PG_DSN" 2>/dev/null || true
  DOCKER exec -i rubbertrack-platform-postgres-1 psql "postgresql://postgres:postgres@localhost:5432/$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
SQL
  for T in $TABLES; do
    DOCKER exec -i rubbertrack-platform-postgres-1 psql "postgresql://postgres:postgres@localhost:5432/$DB_NAME" -v ON_ERROR_STOP=1 <<SQL
CREATE TABLE IF NOT EXISTS ${T} (LIKE public.${T} INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
INSERT INTO ${T} SELECT * FROM public.${T} WHERE tenant_id='$TENANT_ID' ON CONFLICT DO NOTHING;
SQL
    echo "  ✓ copied $T → $DB_NAME.${T}"
  done
fi

# Update the registry.
DOCKER exec -i rubbertrack-platform-postgres-1 psql "$PG_DSN" -v ON_ERROR_STOP=1 -c \
  "UPDATE app.tenants SET tier='$TO_TIER' WHERE id='$TENANT_ID';"

echo "✓ Tenant '$TENANT_ID' escalated to tier $TO_TIER."
[ "$TO_TIER" = "B" ] && echo "  Schema: tenant_${TENANT_ID} (in rubbertrack DB)"
[ "$TO_TIER" = "C" ] && echo "  Database: tenant_${TENANT_ID}"
