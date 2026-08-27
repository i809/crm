# RubberTrack Multi-Tenant Platform

A multi-tenant CRM/CMS/dash platform you sell to multiple clients. Built with:

- **Directus 12** — Admin UI + REST/GraphQL + auth + RBAC + files (control plane)
- **Next.js + shadcn/ui + Refine headless + Recharts** — bespoke screens per tenant template
- **Supabase Postgres** — pgvector + tsvector + trgm + RLS (tenant split)
- **Vercel AI SDK v5 + LlamaIndex.TS** — agentic assistant, Insights, doc pipeline
- **Providers**: OpenRouter, NVIDIA NIM, Ollama, Cloudflare Workers

## Quickstart

```bash
cp .env.example .env
docker compose up -d
# after start: admin@example.com / admin1234
docker exec -it $(docker ps -q -f name=directus) npx directus-template-cli@latest init /directus/snapshots
```

### 1) Bootstrap a tenant

```bash
./infra/scripts/onboard-tenant.sh acme "Acme Trading" rubbertrack A
# Creates a tenant row; RLS policies auto-apply (new tenant sees 0 rows until seeded).
# Tier A = pooled RLS (default), B = schema-per-tenant, C = db-per-tenant.
```

### 2) Apply the schema + RLS (first run)

The schema is applied automatically on first `docker compose up` via the Postgres
init mount (`infra/tenancy/schema.sql` → `/docker-entrypoint-initdb.d/02_schema.sql`).
To re-apply manually:

```bash
docker exec -i rubbertrack-platform-postgres-1 psql -U postgres -d rubbertrack \
  < infra/tenancy/schema.sql
```

### 3) Run isolation tests

```bash
./tests/run-isolation.sh
# Verifies A–E: cross-tenant read=0, cross-tenant INSERT blocked,
# own-tenant data visible, unset-tenant=0, current_tenant() reflects session.
```

## Architecture (phased)

| Phase | Scope | Status |
|------|-------|--------|
| 0 | Scaffold: pgvector + RLS helper + app_role + docker-compose | ✅ done |
| 1 | Template engine: schema + RLS + seed + BFF data endpoints + live preview wiring | ✅ done |
| 2 | Dashboard KPI engine + hybrid search (vector+ts+trgm) | ✅ done |
| 3 | AI platform (Insights, doc pipeline, agentic assistant) | ✅ done |
| 4 | Ops + tenancy escalation (tier B/C) | ✅ done |
| 5 | White-label + release | ✅ done |

### Layout resilience

The preview UI adapts to whatever data shape arrives — adding data sources never
breaks visuals: auto-fill KPI grids, scrollable tables with sticky headers,
`ResizeObserver`-driven charts, and a status-string → color map. Stress-tested
with 21 KPIs + 47 orders (no breakage).

## Docs

See [`docs/00_index.md`](docs/00_index.md) (or open served `docs/...html`).

## Approvals

- Decision 1: Tenancy RLS + tiers — approved
- Decision 2: Vercel AI SDK v5 + LlamaIndex.TS + providers — approved
- Decision 3: Directus control plane — approved
- Decision 4: RubberTrack + Services templates — approved
