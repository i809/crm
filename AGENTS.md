# RubberTrack Multi-Tenant Platform ā€” Agent Memory

## Project
Sellable multi-tenant CRM + analytics dashboard + CMS. RubberTrack (rubber trading) is the cloneable demo tenant template. See `docs/build_handbook.md` for the full architecture, stack pins, and phased plan.

## Stack (approved)
- Postgres 17 (pgvector image) + RLS pooled tenancy (tier A), escalate to schema-per-tenant (B) / DB-per-tenant (C)
- Directus 12 (control plane: admin UI + REST/GraphQL + auth/RBAC)
- Fastify BFF (v5) ā€” tenant detection, RLS-enforced data endpoints, AI proxy
- Next.js 14 + React + shadcn/ui + Recharts + Refine headless (web app)
- AI: Vercel AI SDK v5 + LlamaIndex.TS; providers OpenRouter / NVIDIA NIM / Ollama / Workers AI

## Key learnings (do not re-discover)
- **RLS does NOT apply to superusers or table owners.** Test/run queries as a non-superuser role (`app_role` in `infra/tenancy/schema.sql`). The `postgres` superuser bypasses all policies.
- **`FORCE ROW LEVEL SECURITY`** makes even the table owner subject to RLS (but superusers still bypass ā€” the app_role is the real guarantee).
- **`SET app.tenant_id = $1` doesn't accept parameters.** Use `SELECT set_config('app.tenant_id', $1, false)` (session-level, `is_local=false`) and `RESET app.tenant_id` in `finally` to avoid pool leak.
- **`set_config(..., true)` is transaction-local** ā€” with pg Pool autocommit, the setting dies before the next query. Always use `is_local=false`.
- `pgvector` extension must be `CREATE EXTENSION` inside the target DB (not just the default `postgres` DB) before any `VECTOR(...)` column.
- Directus image: use `directus/directus:latest` (specific tags like 12.4.1 may not exist).
- Fastify v5 requires `@fastify/cors@^11` and `@fastify/helmet@^13`.
- BFF serves the static `preview/` dir via `@fastify/static` so a single cloudflared tunnel exposes both UI and `/data/*` API.

## Layout resilience (preview)
- KPIs and cards use `grid-template-columns: repeat(auto-fill, minmax(Npx,1fr))` ā€” adding data rows/KPIs never breaks the grid.
- Tables are wrapped in a scrollable `.table-wrap` with sticky headers ā€” any row count works.
- Charts use ECharts with a `ResizeObserver` per chart ā€” they adapt to container/data changes.
- Status colors come from a `STATUS_COLOR` map keyed by status string, not hardcoded indices.
- `loadLiveData()` merges BFF JSON into `DATA`; if the BFF is unreachable, static fallback keeps the UI working.

## Running
- `docker compose up -d` ā†’ postgres:5432, directus:8055, bff:4000, ai:5000, web:3000
- Directus admin: admin@example.com / admin1234
- Preview UI + live data: http://localhost:4000 (BFF serves both)
- Cloudflared quick tunnel: `cloudflared tunnel --url http://localhost:4000` (URL is ephemeral)
- Isolation tests: `docker exec -i <pg> psql "postgresql://app_role:apppass@localhost:5432/rubbertrack" < /tmp/test_isolation.sql`

## Phase status
- Phase 0 (scaffold): DONE ā€” pgvector, helper.sql, app_role
- Phase 1 (template engine): DONE ā€” screen_configs table+RLS, Directus 12 roles/policies (7 roles, idempotent), Excel import/export (date-serial fix), screen-config editor endpoint (GET/PUT), 3 new preview screens (Doc Checker, AI Assistant, Screen Config), isolation Test F pass, Excel round-trip verified.
- Phase 2 (dashboard + hybrid search): DONE ā€” KPI engine (/data/kpi/trend|grades|issues|chart), hybrid /search (tsvector+trgm+optional pgvector), real AI RAG (deterministic 768-dim hash embeddings, /index + /chat, RLS-scoped), global Search screen, dashboard charts wired to live KPI endpoints
- Phase 3 (AI platform): DONE — ai_usage_logs table+RLS, provider router (local/openrouter/nim/openai/ollama w/ key-gated fallback), agentic planner→tools→synthesize (search_records/get_kpi/get_issues/get_party), SSE streaming /chat/stream, insights generator (/insights), Doc Checker field-extraction+mismatch flags, usage dashboard (/ai/usage)
- Phase 4 (ops/escalation): DONE — tenant onboarding + template cloning (BFF /tenants POST), tier escalation A→B schema-per-tenant + B→C db-per-tenant (escalate-tenant.sh + /tenants/:id/escalate), per-tenant logical backup (backup-tenant.sh + /tenants/:id/backup), Tenants admin screen, GitHub Actions CI for isolation tests
- Phase 5 (white-label + release): DONE — per-tenant branding (theme.json in app.tenants.theme, BFF GET/PUT /tenants/:id/theme, preview applies CSS vars live), external customer portal (BFF /portal/overview customer-scoped, preview Portal screen), deployment runbook (DEPLOYMENT.md), demo-reset script

## Repo
Local git only (`/workspace/project`, branch `feat/phase0-1-template-engine`). No remote configured. Commits: ac957ce ā†’ c1e2cb6 ā†’ 187d0ad ā†’ 8843782 ā†’ c24637a (phase0/1 gap closure).

## Key learnings (avoid re-discovering)
- **Directus 12 RBAC** uses policies+access model, NOT legacy `permissions` endpoint directly. Create role ā†’ create policy (links role) ā†’ POST /access (role+policy) ā†’ POST /permissions with `policy` field. Filter hyphenated role names with `limit=-1` list + grep (the `filter[name][_eq]` breaks on hyphens).
- **Excel date parsing**: XLSX serializes dates as serial numbers (e.g. 46235). On import use `XLSX.read(buf,{type:'buffer',cellDates:true})` + `sheet_to_json(ws,{raw:false,dateNF:'yyyy-mm-dd'})` to get ISO strings.
- **Postgres init scripts only run on fresh volumes** ā€” to apply schema changes to a running DB, recreate the volume (`docker compose down -v`) or run a migration. The `app_role` is non-superuser so RLS+FORCE applies.
- **RLS pattern**: one `tenant_isolation` policy per table (`FOR ALL USING (tenant_id = app.current_tenant()) WITH CHECK (...)`), ENABLE + FORCE. `app.current_tenant()` reads `current_setting('app.tenant_id')`. Fail-closed when unset (returns NULL ā†’ 0 rows).
- **Preview SPA**: `route()` runs once on load via `loadLiveData().then(route)`; direct-hash navigations rely on `hashchange`. The `render` function can be monkey-patched to hook per-screen init (e.g. load config on the config screen).
- **CSP pitfall**: default helmet CSP sets `script-src-attr 'none'` which silently blocks all inline `onclick=` handlers ā€” buttons look fine but never fire. The BFF now sets an explicit CSP allowing `scriptSrcAttr: 'unsafe-inline'` and `scriptSrc: 'self' + cdn.jsdelivr.net` (for echarts).
- **TDZ pitfall**: calling `loadLiveData()` at the top of app.js threw a silent ReferenceError because it reads `let currentTenant` declared later ā€” the catch fell back to static data so it looked fine. Initial load must run at the END of app.js.
- **Docker-in-docker networking**: start dockerd WITHOUT `--iptables=false` (breaks embedded DNS at 127.0.0.11 ā†’ inter-container name resolution fails with EAI_AGAIN). Build images with `docker build --network=host` to bypass buildkit DNS issues reaching npmjs.
