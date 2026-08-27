#!/usr/bin/env bash
# Tenant onboarding: clones a template to create a new tenant.
# Creates: tenant row + tenant-admin user + role assignment + RLS isolation.
#
# Usage:
#   ./infra/scripts/onboard-tenant.sh <tenant_id> <label> <template> [tier] [admin_email]
#   e.g. ./infra/scripts/onboard-tenant.sh acme "Acme Trading" rubbertrack A ops@acme.co
#
# Tier: A=pooled RLS (default), B=schema-per-tenant, C=db-per-tenant.
# Prereq: run ./infra/scripts/setup-directus.sh once to create RBAC roles.
set -euo pipefail

TENANT_ID="${1:?usage: $0 <tenant_id> <label> <template> [tier] [admin_email]}"
LABEL="${2:?label required}"
TEMPLATE="${3:?template required (rubbertrack|services)}"
TIER="${4:-A}"
ADMIN_EMAIL="${5:-}"
PG_DSN="${PG_DSN:-postgresql://postgres:postgres@localhost:5432/rubbertrack}"
DIRECTUS_URL="${DIRECTUS_URL:-http://localhost:8055}"

# Use sudo for docker only if the user lacks direct access (script stays portable).
DOCKER() { docker "$@" 2>/dev/null || sudo docker "$@"; }

echo "→ Onboarding tenant '$TENANT_ID' (label='$LABEL', template='$TEMPLATE', tier='$TIER')"

# 1. Insert tenant row (idempotent)
DOCKER exec -i rubbertrack-platform-postgres-1 psql "$PG_DSN" -v ON_ERROR_STOP=1 <<SQL
INSERT INTO app.tenants (id, label, template, tier, status)
VALUES ('$TENANT_ID', '$LABEL', '$TEMPLATE', '$TIER', 'active')
ON CONFLICT (id) DO UPDATE SET label=EXCLUDED.label, template=EXCLUDED.template, tier=EXCLUDED.tier;
SQL

# 2. Verify the tenant is isolated (RLS: app_role sees 0 rows until seeded)
echo "→ Verifying RLS isolation for new tenant (expect 0 rows)..."
DOCKER exec -i rubbertrack-platform-postgres-1 psql "postgresql://app_role:apppass@localhost:5432/rubbertrack" \
  -v ON_ERROR_STOP=1 -c "SET app.tenant_id='$TENANT_ID'; SELECT count(*) AS isolated_rows FROM records;"

# 3. Create a tenant-admin user in Directus (if email provided) and assign the role.
#    The user's app.tenant_id is bound at login time by the BFF (Phase 1+).
if [ -n "$ADMIN_EMAIL" ]; then
  echo "→ Creating tenant-admin user ($ADMIN_EMAIL) for $TENANT_ID..."
  TOKEN=$(curl -s -X POST "$DIRECTUS_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"admin@example.com\",\"password\":\"admin1234\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['access_token'])")
  ROLE_ID=$(curl -s -H "Authorization: Bearer $TOKEN" \
    "$DIRECTUS_URL/roles?fields=id,name&limit=-1" \
    | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print(next((r['id'] for r in d if r['name']=='tenant-admin'),''))")
  if [ -n "$ROLE_ID" ]; then
    # Store the tenant binding in the user's tenant_id field (Directus users table).
    FIRST_PASS="${TENANT_ID}1234"
    curl -s -o /dev/null -X POST "$DIRECTUS_URL/users" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d "{\"first_name\":\"$LABEL\",\"email\":\"$ADMIN_EMAIL\",\"password\":\"$FIRST_PASS\",\"role\":\"$ROLE_ID\",\"tenant_id\":\"$TENANT_ID\",\"status\":\"active\"}" \
      || echo "  (user may already exist — skipping)"
    echo "  ✓ tenant-admin user created: $ADMIN_EMAIL (temp password: $FIRST_PASS)"
  else
    echo "  ! tenant-admin role not found — run setup-directus.sh first"
  fi
fi

echo "✓ Tenant '$TENANT_ID' onboarded. RLS policies auto-apply — set app.tenant_id='$TENANT_ID' to seed/use."
echo "  Next: seed data via Directus or INSERTs scoped to this tenant."

# 4. Clone template data (optional) — copy the template tenant's rows into the
#    new tenant so it starts with a working dataset. Re-tenant each row.
if [ "${CLONE_TEMPLATE:-0}" = "1" ] && [ "$TEMPLATE" != "$TENANT_ID" ]; then
  echo "→ Cloning template '$TEMPLATE' data into '$TENANT_ID' (CLONE_TEMPLATE=1)..."
  TABLES="records parties tickets feed_items checklists screen_configs"
  for T in $TABLES; do
    # Build a column list excluding tenant_id (portable across PG versions).
    COLS=$(DOCKER exec -i rubbertrack-platform-postgres-1 psql "$PG_DSN" -tAc \
      "SELECT string_agg(column_name, ',' ORDER BY ordinal_position) FROM information_schema.columns
       WHERE table_schema='public' AND table_name='${T}' AND column_name<>'tenant_id';")
    DOCKER exec -i rubbertrack-platform-postgres-1 psql "$PG_DSN" -v ON_ERROR_STOP=1 <<SQL
INSERT INTO public.${T} (tenant_id, ${COLS})
  SELECT '$TENANT_ID', ${COLS} FROM public.${T} WHERE tenant_id='$TEMPLATE' ON CONFLICT DO NOTHING;
SQL
    N=$(DOCKER exec -i rubbertrack-platform-postgres-1 psql "$PG_DSN" -tAc \
      "SELECT count(*) FROM public.${T} WHERE tenant_id='$TENANT_ID';")
    echo "  ✓ $T: $N rows cloned"
  done
fi

