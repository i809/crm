#!/usr/bin/env bash
# Demo reset: wipes the Postgres volume and re-seeds the demo tenants so the
# platform returns to a clean, known state (handy for sales demos).
#
# Usage: ./infra/scripts/demo-reset.sh
set -euo pipefail
PG_DSN="${PG_DSN:-postgresql://postgres:postgres@localhost:5432/rubbertrack}"
DOCKER() { docker "$@" 2>/dev/null || sudo docker "$@"; }

echo "→ Resetting demo state (drops + recreates the Postgres volume)..."
DOCKER compose down -v
DOCKER compose up -d --no-deps postgres
echo "→ Waiting for schema + seed (init scripts run on fresh volume)..."
sleep 20

echo "→ Verifying seed tenants..."
DOCKER exec -i rubbertrack-platform-postgres-1 psql "$PG_DSN" -tAc \
  "SELECT id||' ('||tier||')' FROM app.tenants ORDER BY id;"

echo "→ Reindexing AI knowledge base..."
curl -s -X POST -H "x-tenant-id: rubbertrack" http://localhost:4000/ai/reindex || true
echo

echo "✓ Demo reset complete. Start the rest with: docker compose up -d"
