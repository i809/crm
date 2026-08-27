# Deployment Runbook — RubberTrack Multi-Tenant Platform

## Prerequisites
- Docker 24+ and Docker Compose v2
- Git
- (Optional, for real AI) an OpenRouter / OpenAI / NVIDIA NIM API key

## 1. First-time setup

```bash
git clone <repo> && cd crm
cp .env.example .env          # edit secrets
docker compose up -d          # boots postgres, directus, ai-service, bff, web
# Wait ~30s for the Postgres init scripts (schema.sql + seed) to run.
```

Verify:
```bash
curl http://localhost:4000/health        # {"ok":true,"service":"bff"}
curl http://localhost:5000/health        # {"ok":true,"service":"ai"}
docker exec -it $(docker ps -q -f name=postgres) psql -U postgres -d rubbertrack -c "\dt"
```

Apply the Directus control-plane setup (RBAC roles + collections):
```bash
./infra/scripts/setup-directus.sh
```

## 2. Onboard a new tenant

```bash
# Tier A (pooled RLS — default):
./infra/scripts/onboard-tenant.sh acme "Acme Trading" rubbertrack A ops@acme.co

# Clone the template's demo data into the new tenant:
CLONE_TEMPLATE=1 ./infra/scripts/onboard-tenant.sh acme "Acme Trading" rubbertrack A
```

Or via the BFF API (used by the Tenants admin screen):
```bash
curl -X POST http://localhost:4000/tenants \
  -H 'content-type: application/json' \
  -d '{"id":"acme","label":"Acme Trading","template":"rubbertrack","tier":"A","cloneTemplate":true}'
```

## 3. Escalate a tenant's isolation tier

```bash
# A → B (schema-per-tenant):
./infra/scripts/escalate-tenant.sh acme B
# B → C (db-per-tenant):
./infra/scripts/escalate-tenant.sh acme C
```
Or: `curl -X POST http://localhost:4000/tenants/acme/escalate -H 'content-type: application/json' -d '{"toTier":"B"}'`

## 4. Per-tenant backup

```bash
./infra/scripts/backup-tenant.sh rubbertrack ./backups
# → ./backups/rubbertrack-<timestamp>.sql.gz
```
Or download via the BFF: `curl -o acme.json http://localhost:4000/tenants/acme/backup`

Restore:
```bash
gunzip -c ./backups/rubbertrack-*.sql.gz | psql $DATABASE
```

## 5. White-label branding

Via the **Branding** screen in the UI, or the API:
```bash
curl -X PUT http://localhost:4000/tenants/acme/theme \
  -H 'content-type: application/json' \
  -d '{"theme":{"primary":"#7c3aed","accent":"#ec4899","logoText":"AcmeCo"}}'
```

## 6. AI

```bash
# Reindex the tenant's knowledge base (records/tickets/parties → embeddings):
curl -X POST http://localhost:4000/ai/reindex -H 'x-tenant-id: rubbertrack'

# To use a real LLM provider, set an env var and restart ai-service:
#   OPENROUTER_API_KEY=...  AI_PROVIDER=openrouter  docker compose up -d --force-recreate ai-service
```

## 7. Demo reset

```bash
./infra/scripts/demo-reset.sh
```
Drops + recreates the Postgres volume and re-seeds the demo tenants.

## 8. Teardown

```bash
docker compose down       # stop
docker compose down -v     # stop + wipe volumes (fresh start)
```
