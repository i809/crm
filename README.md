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
node --env-file=.env apps/bff/scripts/onboard-tenant.js rubbertrack --template=rubbertrack
```

The script reads `DIRECTUS_URL`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`
(see `.env.example`). It creates the tenant record, clones the template
collections, creates the standard roles, and seeds sample orders unless you pass
`--no-seed`.

### 2) Enable RLS (per client)

The tenancy helper (`infra/tenancy/helper.sql`) is already applied automatically
when the Postgres container first starts. To re-run it on an existing database:

```bash
docker compose exec postgres psql -U postgres -d rubbertrack -f /docker-entrypoint-initdb.d/01_helper.sql
```

### 3) Smoke-test services

```bash
curl http://localhost:4000/health   # BFF
curl http://localhost:5000/health   # AI service
curl -X POST http://localhost:4000/ai/chat -H 'content-type: application/json' -d '{"message":"hi"}'
```

## Docs

See [`docs/00_index.md`](docs/00_index.md) (or open served `docs/...html`).

## Approvals

- Decision 1: Tenancy RLS + tiers — approved
- Decision 2: Vercel AI SDK v5 + LlamaIndex.TS + providers — approved
- Decision 3: Directus control plane — approved
- Decision 4: RubberTrack + Services templates — approved
