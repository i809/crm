import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import pg from 'pg'
import fastifyStatic from '@fastify/static'
import multipart from '@fastify/multipart'
import { fileURLToPath } from 'url'
import path from 'path'
import * as XLSX from 'xlsx'

const fastify = Fastify({ logger: true })
const PORT = parseInt(process.env.BFF_PORT || '4000', 10)
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:5000'

// Postgres pool as the non-superuser app_role so RLS applies.
const pool = new pg.Pool({
  host: process.env.PG_HOST || 'postgres',
  port: 5432,
  database: process.env.PG_DATABASE || 'rubbertrack',
  user: process.env.PG_USER || 'app_role',
  password: process.env.PG_PASSWORD || 'apppass',
})

await fastify.register(cors, { origin: true })
// Preview SPA uses inline event handlers (onclick=...), so allow them in CSP.
await fastify.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: null,
    },
  },
})
await fastify.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } })

fastify.get('/health', async () => ({ ok: true, service: 'bff' }))

// Tenant-detection middleware.
// TODO: parse Directus JWT for real auth. For dev, x-tenant-id header selects the tenant.
fastify.addHook('preHandler', async (req) => {
  req.tenantId = req.headers['x-tenant-id'] || 'rubbertrack'
})

// Helper: run a query scoped to the request's tenant via RLS.
async function tenantQuery(req, text, params = []) {
  const client = await pool.connect()
  try {
    // is_local=false → session-level (persists across this connection's queries)
    await client.query("SELECT set_config('app.tenant_id', $1, false)", [req.tenantId])
    return await client.query(text, params)
  } finally {
    // Clear so a pooled connection can't leak a tenant into the next request.
    await client.query("RESET app.tenant_id")
    client.release()
  }
}

// ---- Data endpoints (RLS-enforced) ----
fastify.get('/data/dashboard', async (req) => {
  const records = await tenantQuery(req, 'SELECT order_id, customer, supplier, grade, mt, fcl, price_usd, status FROM records ORDER BY created_at DESC LIMIT 4')
  const kpi = await tenantQuery(req, `SELECT
    (SELECT count(*) FROM records) AS open_orders,
    (SELECT coalesce(sum(mt),0) FROM records) AS active_mt,
    (SELECT count(*) FROM parties WHERE type='supplier') AS suppliers,
    (SELECT count(*) FROM parties WHERE type='customer') AS customers,
    (SELECT count(*) FROM tickets WHERE status<>'Resolved') AS open_issues`)
  const issues = await tenantQuery(req, `SELECT ticket_id, category, description, status FROM tickets WHERE status<>'Resolved' ORDER BY created_at DESC LIMIT 5`)
  const feed = await tenantQuery(req, `SELECT category, title, priority, published_at FROM feed_items ORDER BY published_at DESC LIMIT 8`)
  return { kpi: kpi.rows[0], orders: records.rows, issues: issues.rows, feed: feed.rows }
})

fastify.get('/data/orders', async (req) => {
  const r = await tenantQuery(req, 'SELECT order_id, customer, supplier, grade, mt, fcl, price_usd, status FROM records ORDER BY created_at DESC')
  return { orders: r.rows }
})

fastify.get('/data/issues', async (req) => {
  const r = await tenantQuery(req, 'SELECT ticket_id, category, description, status FROM tickets ORDER BY created_at DESC')
  const agg = await tenantQuery(req, 'SELECT category, count(*)::int AS value FROM tickets GROUP BY category')
  return { issues: r.rows, mix: agg.rows }
})

fastify.get('/data/parties', async (req) => {
  const sup = await tenantQuery(req, "SELECT name FROM parties WHERE type='supplier' ORDER BY name")
  const cus = await tenantQuery(req, "SELECT name FROM parties WHERE type='customer' ORDER BY name")
  return { suppliers: sup.rows.map(r => r.name), customers: cus.rows.map(r => r.name) }
})

fastify.get('/data/checklists', async (req) => {
  const r = await tenantQuery(req, 'SELECT checklist_json FROM checklists WHERE active=true ORDER BY id DESC LIMIT 1')
  return { items: r.rows[0]?.checklist_json || [] }
})

// ---- KPI engine (Phase 2a) — RLS-scoped aggregations for the chart builder ----
// Time-series of volume (MT) + revenue per month, driven by record.date.
fastify.get('/data/kpi/trend', async (req) => {
  const months = Math.min(parseInt(req.query.months || '6', 10), 24)
  const r = await tenantQuery(req, `
    SELECT to_char(date_trunc('month', date), 'YYYY-MM') AS month,
           coalesce(sum(mt),0)::float AS mt,
           coalesce(sum(mt * price_usd),0)::float AS revenue
    FROM records
    WHERE date >= date_trunc('month', current_date) - ($1 || ' months')::interval
    GROUP BY 1 ORDER BY 1`, [months])
  return { months: r.rows.map(x => x.month), mt: r.rows.map(x => x.mt), revenue: r.rows.map(x => x.revenue) }
})

// Volume by rubber grade.
fastify.get('/data/kpi/grades', async (req) => {
  const r = await tenantQuery(req, `
    SELECT grade, coalesce(sum(mt),0)::float AS mt, coalesce(sum(fcl),0)::int AS fcl
    FROM records GROUP BY grade ORDER BY mt DESC`)
  return { grades: r.rows }
})

// Issue mix by category + status breakdown.
fastify.get('/data/kpi/issues', async (req) => {
  const cat = await tenantQuery(req, 'SELECT category, count(*)::int AS value FROM tickets GROUP BY category ORDER BY value DESC')
  const status = await tenantQuery(req, 'SELECT status, count(*)::int AS value FROM tickets GROUP BY status ORDER BY value DESC')
  return { by_category: cat.rows, by_status: status.rows }
})

// Generic chart endpoint for the config-driven chart builder: any {dimension, metric}
// against records (or any other table), so screen_configs charts need no new code.
// ?dimension=grade&metric=mt&table=records&group_by=month&time_range=6
fastify.get('/data/kpi/chart', async (req, reply) => {
  const TABLES = { records: 'records', tickets: 'tickets', parties: 'parties', feed_items: 'feed_items' }
  const DIMS = { grade: 'grade', customer: 'customer', supplier: 'supplier', status: 'status', category: 'category', type: 'type', month: "to_char(date_trunc('month', date), 'YYYY-MM')" }
  const METRICS = { mt: 'sum(mt)', fcl: 'sum(fcl)', count: 'count(*)', revenue: 'sum(mt*price_usd)', avg_price: 'avg(price_usd)' }
  const table = TABLES[req.query.table] || 'records'
  const dim = DIMS[req.query.dimension]; const met = METRICS[req.query.metric]
  if (!dim || !met) return reply.code(400).send({ error: 'bad dimension/metric', tables: Object.keys(TABLES), dims: Object.keys(DIMS), metrics: Object.keys(METRICS) })
  let where = '', params = []
  const months = Math.min(parseInt(req.query.time_range || '0', 10), 36)
  if (months > 0 && table === 'records') { where = `WHERE date >= date_trunc('month', current_date) - $1::interval`; params = [`${months} months`] }
  const r = await tenantQuery(req, `SELECT ${dim} AS label, ${met}::float AS value FROM ${table} ${where} GROUP BY 1 ORDER BY ${req.query.dimension === 'month' ? '1 ASC' : '2 DESC'} LIMIT 30`, params)
  return { table, dimension: req.query.dimension, metric: req.query.metric, group_by: req.query.group_by || null, time_range: months || null, labels: r.rows.map(x => x.label), values: r.rows.map(x => x.value) }
})

// ---- Real-time KPI stream (SSE) — pushes fresh KPI snapshots every N seconds ----
fastify.get('/data/stream', async (req, reply) => {
  const interval = Math.min(Math.max(parseInt(req.query.interval || '5', 10), 2), 60) * 1000
  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  })
  const send = (data) => reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
  const tick = async () => {
    try {
      const r = await tenantQuery(req, `SELECT
        (SELECT count(*) FROM records) AS open_orders,
        (SELECT coalesce(sum(mt),0) FROM records) AS active_mt,
        (SELECT count(*) FROM tickets WHERE status<>'Resolved') AS open_issues,
        (SELECT count(*) FROM parties WHERE type='supplier') AS suppliers,
        (SELECT count(*) FROM parties WHERE type='customer') AS customers,
        now() AS ts`)
      send({ kpi: r.rows[0] })
    } catch (e) { /* swallow — keep the stream alive */ }
  }
  await tick()
  const t = setInterval(tick, interval)
  req.raw.on('close', () => clearInterval(t))
  req.raw.on('end', () => clearInterval(t))
})

// ---- Hybrid search (Phase 2b) — tsvector keyword + pg_trgm fuzzy + pgvector semantic ----
// Keyword + fuzzy over records/parties/tickets/feed; semantic over embeddings when
// the caller passes ?embedding=[...] (ai-service supplies query vectors). All RLS-scoped.
fastify.get('/search', async (req) => {
  const q = (req.query.q || '').trim()
  if (!q) return { q, records: [], parties: [], tickets: [], feed: [], semantic: [] }
  const like = `%${q}%`
  const [records, parties, tickets, feed] = await Promise.all([
    tenantQuery(req, `
      SELECT order_id, customer, supplier, grade, mt, status,
        ts_rank(to_tsvector('english', coalesce(order_id,'')||' '||coalesce(customer,'')||' '||coalesce(supplier,'')||' '||coalesce(grade,'')), plainto_tsquery('english', $1)) AS rank
      FROM records
      WHERE to_tsvector('english', coalesce(order_id,'')||' '||coalesce(customer,'')||' '||coalesce(supplier,'')||' '||coalesce(grade,''))
            @@ plainto_tsquery('english', $1)
         OR customer ILIKE $2 OR supplier ILIKE $2 OR order_id ILIKE $2 OR grade ILIKE $2
      ORDER BY rank DESC LIMIT 10`, [q, like]),
    tenantQuery(req, `
      SELECT name, type, similarity(name, $1::text) AS sim
      FROM parties WHERE name ILIKE $2 OR similarity(name, $1::text) > 0.15
      ORDER BY sim DESC LIMIT 10`, [q, like]),
    tenantQuery(req, `
      SELECT ticket_id, category, status, left(description,120) AS snippet
      FROM tickets
      WHERE description ILIKE $1 OR category ILIKE $1 OR ticket_id ILIKE $1
      LIMIT 10`, [like]),
    tenantQuery(req, `
      SELECT category, title, priority
      FROM feed_items
      WHERE title ILIKE $1 OR description ILIKE $1 OR category ILIKE $1
      LIMIT 10`, [like]),
  ])
  // Optional semantic leg: if the client supplies a query embedding, rank the
  // tenant's embeddings by cosine distance. (Empty table → empty result, safe.)
  let semantic = []
  const emb = req.query.embedding
  if (emb) {
    try {
      const vec = JSON.parse(emb)
      const r = await tenantQuery(req, `
        SELECT source_type, source_id, left(metadata->>'text',200) AS snippet, 1 - (vector <=> $1::vector) AS score
        FROM embeddings ORDER BY vector <=> $1::vector LIMIT 5`, [`[${vec.join(',')}]`])
      semantic = r.rows
    } catch { semantic = [] }
  }
  return { q, records: records.rows, parties: parties.rows, tickets: tickets.rows, feed: feed.rows, semantic }
})

// ---- Excel/CSV import & export (tenant-scoped via RLS) ----
const IMPORTABLE = ['records', 'parties', 'tickets', 'feed_items']
const EXPORT_FIELDS = {
  records: ['order_id', 'date', 'customer', 'supplier', 'grade', 'mt', 'fcl', 'price_usd', 'status'],
  parties: ['name', 'type', 'contact', 'tags'],
  tickets: ['ticket_id', 'customer', 'supplier', 'category', 'status', 'description'],
  feed_items: ['category', 'title', 'description', 'priority', 'published_at'],
}

// Export a collection to xlsx. ?type=records|parties|tickets|feed_items
fastify.get('/data/export', async (req, reply) => {
  const type = (req.query.type || 'records')
  if (!IMPORTABLE.includes(type)) return reply.code(400).send({ error: 'unsupported type' })
  const fields = EXPORT_FIELDS[type]
  const r = await tenantQuery(req, `SELECT ${fields.join(',')} FROM ${type} ORDER BY created_at DESC`)
  const ws = XLSX.utils.json_to_sheet(r.rows.length ? r.rows : [{}])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, type)
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  reply.header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  reply.header('content-disposition', `attachment; filename="${type}-${req.tenantId}.xlsx"`)
  return buf
})

// Import xlsx/csv into a collection. Multipart upload: file + type.
fastify.post('/data/import', async (req, reply) => {
  const file = await req.file()
  if (!file) return reply.code(400).send({ error: 'no file' })
  const type = file.fields?.type?.value || 'records'
  if (!IMPORTABLE.includes(type)) return reply.code(400).send({ error: 'unsupported type' })
  const buf = await file.toBuffer()
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: false, dateNF: 'yyyy-mm-dd' })
  if (!rows.length) return { imported: 0 }
  const fields = EXPORT_FIELDS[type]
  // Build a parameterized multi-row INSERT (all tenant-scoped by RLS WITH CHECK).
  const cols = ['tenant_id', ...fields]
  let paramIdx = 1
  const values = []
  const placeholders = rows.map((row) => {
    const ph = cols.map(() => `$${paramIdx++}`).join(',')
    values.push(req.tenantId, ...fields.map((f) => row[f] ?? null))
    return `(${ph})`
  }).join(',')
  const sql = `INSERT INTO ${type} (${cols.join(',')}) VALUES ${placeholders}`
  await tenantQuery(req, sql, values)
  return { imported: rows.length, type }
})

// ---- Screen-config editor (per-tenant dashboard layout) ----
// Stores which charts/cards each screen shows so admins can reconfigure without code.
fastify.get('/data/screen-config', async (req) => {
  const screen = req.query.screen || 'dashboard'
  const r = await tenantQuery(req,
    'SELECT config FROM screen_configs WHERE active=true AND screen=$1 ORDER BY id DESC LIMIT 1', [screen])
  return { screen, config: r.rows[0]?.config || null }
})

fastify.put('/data/screen-config', async (req) => {
  const { screen = 'dashboard', config = {} } = req.body || {}
  // Deactivate old configs for this screen, then insert the new one (tenant-scoped).
  await tenantQuery(req, "UPDATE screen_configs SET active=false WHERE screen=$1", [screen])
  const r = await tenantQuery(req,
    "INSERT INTO screen_configs (tenant_id, screen, config, active) VALUES ($1,$2,$3,true) RETURNING id",
    [req.tenantId, screen, JSON.stringify(config)])
  return { id: r.rows[0]?.id, screen, saved: true }
})

// ---- Tenant admin (Phase 4e) — list / onboard / escalate / backup tenants ----
// NB: privileged admin endpoints. They connect as the postgres superuser (NOT
// app_role) so they can read/write the app.tenants registry and create schemas.
const adminPool = new pg.Pool({
  host: process.env.PG_HOST || 'postgres',
  port: 5432,
  database: process.env.PG_DATABASE || 'rubbertrack',
  user: process.env.PG_ADMIN_USER || 'postgres',
  password: process.env.PG_ADMIN_PASSWORD || 'postgres',
})

// List tenants (admin only — no RLS on the registry table).
fastify.get('/tenants', async () => {
  const r = await adminPool.query(
    'SELECT id, label, template, tier, status, created_at FROM app.tenants ORDER BY created_at')
  return { tenants: r.rows }
})

// Onboard a tenant: create registry row + clone template data (Phase 4a).
fastify.post('/tenants', async (req, reply) => {
  const { id, label, template = 'rubbertrack', tier = 'A', cloneTemplate = true } = req.body || {}
  if (!id || !label) return reply.code(400).send({ error: 'id and label required' })
  if (!/^[a-z0-9_-]+$/i.test(id)) return reply.code(400).send({ error: 'id must be alphanumeric/dash/underscore' })
  await adminPool.query(
    `INSERT INTO app.tenants (id, label, template, tier, status) VALUES ($1,$2,$3,$4,'active')
     ON CONFLICT (id) DO UPDATE SET label=EXCLUDED.label, template=EXCLUDED.template, tier=EXCLUDED.tier`,
    [id, label, template, tier])
  let cloned = {}
  if (cloneTemplate && template !== id) {
    for (const t of ['records','parties','tickets','feed_items','checklists','screen_configs']) {
      // Exclude the `id` PK (bigserial) so clones get fresh ids, not conflicts.
      const cols = await adminPool.query(
        `SELECT string_agg(column_name, ',' ORDER BY ordinal_position) AS c FROM information_schema.columns
         WHERE table_schema='public' AND table_name=$1 AND column_name NOT IN ('tenant_id','id')`, [t])
      const colList = cols.rows[0].c
      await adminPool.query(`INSERT INTO public.${t} (tenant_id, ${colList}) SELECT $1, ${colList} FROM public.${t} WHERE tenant_id=$2`, [id, template])
      cloned[t] = (await adminPool.query(`SELECT count(*)::int AS n FROM public.${t} WHERE tenant_id=$1`, [id])).rows[0].n
    }
  }
  return { onboarded: true, id, label, template, tier, cloned }
})

// Escalate a tenant's tier (A→B schema-per-tenant, B→C db-per-tenant).
fastify.post('/tenants/:id/escalate', async (req, reply) => {
  const { id } = req.params
  const { toTier } = req.body || {}
  if (!['B','C'].includes(toTier)) return reply.code(400).send({ error: 'toTier must be B or C' })
  const cur = await adminPool.query('SELECT tier FROM app.tenants WHERE id=$1', [id])
  if (!cur.rows.length) return reply.code(404).send({ error: 'tenant not found' })
  const fromTier = cur.rows[0].tier
  if (fromTier === toTier) return { escalated: false, id, fromTier, toTier, note: 'already at target' }
  const TABLES = ['records','parties','tickets','feed_items','checklists','files','hr_events','screen_configs','embeddings','ai_usage_logs']
  if (toTier === 'B') {
    const schema = `tenant_${id}`
    await adminPool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`)
    for (const t of TABLES) {
      await adminPool.query(`CREATE TABLE IF NOT EXISTS ${schema}.${t} (LIKE public.${t} INCLUDING DEFAULTS INCLUDING CONSTRAINTS)`)
      await adminPool.query(`INSERT INTO ${schema}.${t} SELECT * FROM public.${t} WHERE tenant_id=$1 ON CONFLICT DO NOTHING`, [id])
    }
  } else {
    const db = `tenant_${id}`
    await adminPool.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1`, [db]).catch(() => {})
    await adminPool.query(`CREATE DATABASE ${db}`).catch(() => {})
    const tmpPool = new pg.Pool({ host: process.env.PG_HOST || 'postgres', port: 5432, database: db, user: process.env.PG_ADMIN_USER || 'postgres', password: process.env.PG_ADMIN_PASSWORD || 'postgres' })
    try {
      await tmpPool.query('CREATE EXTENSION IF NOT EXISTS vector')
      await tmpPool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm')
      for (const t of TABLES) {
        await tmpPool.query(`CREATE TABLE IF NOT EXISTS ${t} (LIKE public.${t} INCLUDING DEFAULTS INCLUDING CONSTRAINTS)`)
        const rows = await adminPool.query(`SELECT * FROM public.${t} WHERE tenant_id=$1`, [id])
        for (const r of rows.rows) {
          const cols = Object.keys(r), vals = Object.values(r)
          const ph = cols.map((_, i) => `$${i+1}`).join(',')
          await tmpPool.query(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${ph}) ON CONFLICT DO NOTHING`, vals)
        }
      }
    } finally { await tmpPool.end() }
  }
  await adminPool.query('UPDATE app.tenants SET tier=$1 WHERE id=$2', [toTier, id])
  return { escalated: true, id, fromTier, toTier, isolation: toTier === 'B' ? `tenant_${id} schema` : `tenant_${id} database` }
})

// Per-tenant branding (Phase 5a) — read/update the theme JSON stored in app.tenants.
fastify.get('/tenants/:id/theme', async (req, reply) => {
  const { id } = req.params
  const r = await adminPool.query('SELECT theme, label FROM app.tenants WHERE id=$1', [id])
  if (!r.rows.length) return reply.code(404).send({ error: 'tenant not found' })
  return { tenant: id, label: r.rows[0].label, theme: r.rows[0].theme || {} }
})
fastify.put('/tenants/:id/theme', async (req, reply) => {
  const { id } = req.params
  const { theme } = req.body || {}
  if (!theme || typeof theme !== 'object') return reply.code(400).send({ error: 'theme object required' })
  const r = await adminPool.query('UPDATE app.tenants SET theme=$1 WHERE id=$2 RETURNING theme', [JSON.stringify(theme), id])
  if (!r.rows.length) return reply.code(404).send({ error: 'tenant not found' })
  return { tenant: id, theme: r.rows[0].theme }
})

// ---- External customer portal (Phase 5b) ----
// A customer logs in (here: x-customer header for dev) and sees ONLY their own
// orders + issues within the tenant. Uses app_role + RLS (tenant) + a customer
// filter (row-level scoping beyond RLS).
fastify.get('/portal/overview', async (req) => {
  const customer = req.headers['x-customer']
  if (!customer) return { error: 'x-customer header required' }
  const orders = await tenantQuery(req, 'SELECT order_id, grade, mt, fcl, price_usd, status, date FROM records WHERE customer=$1 ORDER BY date DESC', [customer])
  const issues = await tenantQuery(req, 'SELECT ticket_id, category, status, description FROM tickets WHERE customer=$1 ORDER BY created_at DESC', [customer])
  const kpi = await tenantQuery(req, `SELECT count(*)::int AS orders, coalesce(sum(mt),0)::float AS mt, coalesce(sum(mt*price_usd),0)::float AS revenue FROM records WHERE customer=$1`, [customer])
  return { customer, tenant: req.tenantId, orders: orders.rows, issues: issues.rows, kpi: kpi.rows[0] }
})

// Per-tenant logical backup (JSON dump of the tenant's rows across all tables).
fastify.get('/tenants/:id/backup', async (req, reply) => {
  const { id } = req.params
  const exists = await adminPool.query('SELECT 1 FROM app.tenants WHERE id=$1', [id])
  if (!exists.rows.length) return reply.code(404).send({ error: 'tenant not found' })
  const TABLES = ['records','parties','tickets','feed_items','checklists','files','hr_events','screen_configs','embeddings','ai_usage_logs']
  const dump = { tenant: id, backed_up_at: new Date().toISOString(), tables: {} }
  for (const t of TABLES) {
    const r = await adminPool.query(`SELECT row_to_json(x) FROM (SELECT * FROM public.${t} WHERE tenant_id=$1) x`, [id])
    dump.tables[t] = r.rows.map((row) => row.row_to_json)
  }
  reply.header('content-disposition', `attachment; filename="${id}-backup.json"`)
  return dump
})

// Proxy to AI service (approve the AI contexts)
fastify.post('/ai/chat', async (req, reply) => {
  const res = await fetch(`${AI_SERVICE_URL}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tenant-id': req.tenantId },
    body: JSON.stringify(req.body)
  })
  reply.send(await res.text())
})

// Reindex the tenant's knowledge base (records/tickets/parties → embeddings).
fastify.post('/ai/reindex', async (req, reply) => {
  const res = await fetch(`${AI_SERVICE_URL}/index`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tenant-id': req.tenantId },
    body: '{}'
  })
  reply.send(await res.text())
})

// Generate tenant insights (top customer/grade, issue mix, trend, totals).
fastify.post('/ai/insights', async (req, reply) => {
  const res = await fetch(`${AI_SERVICE_URL}/insights`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tenant-id': req.tenantId },
    body: '{}'
  })
  reply.send(await res.text())
})

// Latest stored insights snapshot (auto-loaded by the Insights screen).
fastify.get('/ai/insights/latest', async (req, reply) => {
  const res = await fetch(`${AI_SERVICE_URL}/insights/latest`, {
    headers: { 'x-tenant-id': req.tenantId }
  })
  reply.send(await res.text())
})

// Streaming chat (SSE) — passthrough the ai-service event stream.
fastify.post('/ai/chat/stream', async (req, reply) => {
  const res = await fetch(`${AI_SERVICE_URL}/chat/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tenant-id': req.tenantId },
    body: JSON.stringify(req.body),
  })
  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  })
  // Pipe the upstream SSE straight through to the client.
  for await (const chunk of res.body) reply.raw.write(chunk)
  reply.raw.end()
})

// AI usage logs (RLS-scoped) — for the tenant's usage dashboard.
fastify.get('/ai/usage', async (req) => {
  const limit = Math.min(parseInt(req.query.limit || '20', 10), 100)
  const r = await tenantQuery(req, `
    SELECT provider, model, tool, tokens_in, tokens_out, cost_usd, latency_ms, created_at
    FROM ai_usage_logs ORDER BY created_at DESC LIMIT $1`, [limit])
  const agg = await tenantQuery(req, `
    SELECT provider, count(*)::int AS calls, coalesce(sum(tokens_out),0)::int AS tokens,
           coalesce(sum(cost_usd),0)::float AS cost
    FROM ai_usage_logs GROUP BY provider ORDER BY calls DESC`)
  return { recent: r.rows, by_provider: agg.rows }
})

const start = async () => {
  try {
    // Serve the static preview/ UI from the BFF so a single tunnel exposes both.
    const dir = path.resolve(fileURLToPath(import.meta.url), '../../preview')
    await fastify.register(fastifyStatic, { root: dir, prefix: '/' })
    await fastify.listen({ port: PORT, host: '0.0.0.0' })
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}
start()
