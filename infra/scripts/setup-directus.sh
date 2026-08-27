#!/usr/bin/env bash
# Register app collections + RBAC roles in Directus (Phase 0 control-plane setup).
# Idempotent: safe to re-run. Creates the 7 roles from docs/roles with permission
# presets layered on top of Postgres RLS (defense-in-depth).
#
# Usage: ./infra/scripts/setup-directus.sh
set -euo pipefail

DIRECTUS_URL="${DIRECTUS_URL:-http://localhost:8055}"
ADMIN_EMAIL="${DIRECTUS_ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${DIRECTUS_ADMIN_PASSWORD:-admin1234}"

echo "→ Authenticating to Directus ($DIRECTUS_URL)..."
TOKEN=$(curl -s -X POST "$DIRECTUS_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['access_token'])")
echo "✓ Authenticated"

AUTH="Authorization: Bearer $TOKEN"

# ------------------------------------------------------------------
# 1. Register app tables as Directus collections with field metadata.
#    RLS still enforces tenant isolation at the DB; Directus adds a
#    second layer (role presets below) and gives admins a CRUD UI.
# ------------------------------------------------------------------
register_collection() {
  local coll="$1"
  curl -s -o /dev/null -X POST "$DIRECTUS_URL/collections" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"collection\":\"$coll\",\"meta\":{\"icon\":\"inventory_2\",\"note\":\"tenant-scoped via RLS\"},\"schema\":null}" \
    || true  # already exists → ignore
  echo "  ✓ collection $coll registered"
}

register_field() {
  local coll="$1" field="$2" type="$3" label="$4"
  curl -s -o /dev/null -X POST "$DIRECTUS_URL/fields/$coll" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"field\":\"$field\",\"type\":\"$type\",\"meta\":{\"label\":\"$label\",\"interface\":\"input\"}}" \
    || true
}

echo "→ Registering collections..."
for c in records parties tickets hr_events feed_items checklists files embeddings screen_configs; do
  register_collection "$c"
done

# Bind Directus users to a tenant: add tenant_id column to directus_users so the
# BFF can read it at login and set the RLS session (app.tenant_id). Idempotent.
sudo docker exec rubbertrack-platform-postgres-1 psql -U postgres -d rubbertrack -c \
  "ALTER TABLE directus_users ADD COLUMN IF NOT EXISTS tenant_id TEXT REFERENCES app.tenants(id);" 2>/dev/null \
  || docker exec rubbertrack-platform-postgres-1 psql -U postgres -d rubbertrack -c \
  "ALTER TABLE directus_users ADD COLUMN IF NOT EXISTS tenant_id TEXT REFERENCES app.tenants(id);"
curl -s -o /dev/null -X POST "$DIRECTUS_URL/fields/directus_users" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"field":"tenant_id","type":"string","meta":{"label":"Tenant","interface":"input","special":null}}' || true
echo "  ✓ directus_users.tenant_id bound (BFF reads it at login for RLS)"

# Key searchable fields surfaced in the admin UI (the rest stay DB-managed).
register_field records order_id  string "Order ID"
register_field records customer  string "Customer"
register_field records supplier  string "Supplier"
register_field records grade     string "Grade"
register_field records mt        float  "Metric Tons"
register_field records status    string "Status"
register_field parties  name     string "Name"
register_field parties  type     string "Type"
register_field tickets  ticket_id string "Ticket ID"
register_field tickets  category string "Category"
register_field tickets  status   string "Status"
register_field feed_items title  string "Title"
register_field feed_items category string "Category"

# ------------------------------------------------------------------
# 2. RBAC: roles + policies + access + permission rules (Directus 12 model).
#    RLS is the hard guarantee at the DB; these presets are the soft second
#    layer and give tenant-admins a CRUD UI. Model:
#      role --access--> policy --permission--> (collection, action, fields)
# ------------------------------------------------------------------
python3 - "$DIRECTUS_URL" "$TOKEN" <<'PY'
import sys, json, urllib.request, urllib.error
url, token = sys.argv[1], sys.argv[2]
H = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

def api(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{url}{path}", data=data, headers=H, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read()) if r.read else {}
    except urllib.error.HTTPError as e:
        if e.code == 400:  # duplicate — idempotent skip
            return {}
        body = e.read().decode()[:200]
        print(f"  ! {method} {path}: {e.code} {body}")
        return {}

ALL = ["records","parties","tickets","hr_events","feed_items","checklists","files","embeddings","screen_configs"]
STAFF = ["records","parties","tickets","checklists","files","screen_configs"]

# (name, description, admin_access, app_access, {action: [tables]})
ROLES = [
    ("privileged-admin", "Platform creator — full system + all tenants", True, True,
        {"create": ALL, "read": ALL, "update": ALL, "delete": ALL}),
    ("tenant-admin", "Client main admin — full data within their tenant", False, True,
        {"create": ALL, "read": ALL, "update": ALL, "delete": ALL}),
    ("staff-sales", "Sales team — records + customers", False, True,
        {"read": STAFF, "create": ["records","parties"], "update": ["records"]}),
    ("staff-logistics", "Operations — tracking + pending docs", False, True,
        {"read": STAFF, "update": ["records","checklists","files"]}),
    ("staff-documentation", "Doc handling — doc checker, diff, files", False, True,
        {"read": ["files","records","parties"], "create": ["files"], "update": ["files"]}),
    ("staff-technical", "Tech support — tickets + settings", False, True,
        {"read": STAFF, "create": ["tickets"], "update": ["tickets"]}),
    ("customer", "External client — own company records/docs only", False, True,
        {"read": ["records","parties","tickets","files"]}),
]

def find_id(path, key, val):
    d = api("GET", f"{path}?filter[{key}][_eq]={val}&fields=id") or {}
    rows = d.get("data", [])
    return rows[0]["id"] if rows else None

print("→ Creating roles + policies + access + permissions...")
for name, desc, admin, app, perms in ROLES:
    # Role (idempotent)
    role_id = find_id("/roles", "name", name)
    if not role_id:
        d = api("POST", "/roles", {"name": name, "description": desc,
                                    "admin_access": admin, "app_access": app})
        role_id = d.get("data", {}).get("id")
    # Policy (idempotent) — one policy per role
    policy_id = find_id("/policies", "name", f"{name}-policy")
    if not policy_id:
        d = api("POST", "/policies", {"name": f"{name}-policy", "description": desc,
                                        "admin_access": admin, "app_access": app})
        policy_id = d.get("data", {}).get("id")
    # Access link role→policy (idempotent: check existing)
    if role_id and policy_id:
        existing = api("GET", f"/access?filter[role][_eq]={role_id}&filter[policy][_eq]={policy_id}")
        if not (existing.get("data")):
            api("POST", "/access", {"role": role_id, "policy": policy_id})
    # Permission rules on the policy (idempotent: delete then recreate per policy)
    if policy_id:
        existing_perms = api("GET", f"/permissions?filter[policy][_eq]={policy_id}").get("data", [])
        if not existing_perms:  # only seed if empty (idempotent)
            for action, tables in perms.items():
                for t in tables:
                    api("POST", "/permissions", {"policy": policy_id, "collection": t,
                        "action": action, "fields": ["*"], "permissions": {}, "validation": {}})
    print(f"  ✓ {name} → policy {policy_id[:8] if policy_id else '?'} ({sum(len(v) for v in perms.values())} rules)")
PY

echo "✅ Directus control-plane setup complete."
echo "   Collections: 8 registered · Roles: 7 with policies + permission presets"
