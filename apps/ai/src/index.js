import Fastify from 'fastify'
import pg from 'pg'
import crypto from 'crypto'

const fastify = Fastify({ logger: true })
const PORT = parseInt(process.env.AI_PORT || '5000', 10)
const DIM = 768

// Connect as non-superuser app_role so RLS applies; tenant set per request.
const pool = new pg.Pool({
  host: process.env.PG_HOST || 'postgres',
  port: 5432,
  database: process.env.PG_DATABASE || 'rubbertrack',
  user: process.env.PG_USER || 'app_role',
  password: process.env.PG_PASSWORD || 'apppass',
})

// ---- Provider router (Phase 3b) ----
// A tenant's provider is chosen by env (default "local"). Real providers
// (openrouter/nim/openai/ollama) light up when their API key is present; until
// then the deterministic local provider runs so the whole platform works offline.
// Swap-in point for the Vercel AI SDK v5 `generateText`/`streamText` calls.
const PROVIDERS = {
  local: { name: 'local', model: 'deterministic-hash-v1' },
  openrouter: { name: 'openrouter', model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet', keyEnv: 'OPENROUTER_API_KEY' },
  nim: { name: 'nim', model: process.env.NIM_MODEL || 'meta/llama-3.1-70b', keyEnv: 'NIM_API_KEY' },
  openai: { name: 'openai', model: process.env.OPENAI_MODEL || 'gpt-4o-mini', keyEnv: 'OPENAI_API_KEY' },
  ollama: { name: 'ollama', model: process.env.OLLAMA_MODEL || 'llama3.1', keyEnv: null },
}
function pickProvider(tenantId) {
  const requested = process.env.AI_PROVIDER || 'local'
  const p = PROVIDERS[requested] || PROVIDERS.local
  // Real providers need a key (ollama needs a reachable host); else fall back.
  if (p.keyEnv && !process.env[p.keyEnv]) return PROVIDERS.local
  return { ...p, tenantId }
}

// ---- Real LLM call via OpenRouter (Chat Completions API) ----
// Replaces the local extractive stub with a grounded generateText call when an
// API key is present. Context = tool observations + semantic retrieval.
async function llmGenerate(provider, systemPrompt, userPrompt) {
  const key = process.env[provider.keyEnv]
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${err.slice(0, 200)}`)
  }
  const data = await res.json()
  return {
    text: data.choices?.[0]?.message?.content || '(no response)',
    tokensIn: data.usage?.prompt_tokens || 0,
    tokensOut: data.usage?.completion_tokens || 0,
  }
}

// ---- Deterministic local embedding (hashing trick, L2-normalized) ----
function embed(text) {
  const v = new Float64Array(DIM)
  const tokens = String(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
  const grams = []
  for (let i = 0; i < tokens.length; i++) {
    grams.push(tokens[i])
    if (i > 0) grams.push(tokens[i - 1] + ' ' + tokens[i])
    if (i > 1) grams.push(tokens[i - 2] + ' ' + tokens[i - 1] + ' ' + tokens[i])
  }
  for (const g of grams) {
    const h = crypto.createHash('sha256').update(g).digest()
    const idx = h.readUInt32BE(0) % DIM
    const sign = h[4] % 2 === 0 ? 1 : -1
    v[idx] += sign
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1
  return Array.from(v, (x) => x / norm)
}

async function tenantQuery(tenantId, text, params = []) {
  const client = await pool.connect()
  try {
    await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId])
    return await client.query(text, params)
  } finally {
    await client.query('RESET app.tenant_id')
    client.release()
  }
}

// ---- Usage logging (Phase 3b) — every AI call is accounted per tenant ----
async function logUsage(tenantId, { requestId, provider, model, tool, tokensIn = 0, tokensOut = 0, costUsd = 0, latencyMs = 0 }) {
  try {
    await tenantQuery(tenantId,
      `INSERT INTO ai_usage_logs (tenant_id, request_id, provider, model, tool, tokens_in, tokens_out, cost_usd, latency_ms)
       VALUES (app.current_tenant(), $1, $2, $3, $4, $5, $6, $7, $8)`,
      [requestId, provider, model, tool, tokensIn, tokensOut, costUsd, latencyMs])
  } catch (e) { fastify.log.warn({ msg: 'usage log failed', err: e.message }) }
}

fastify.get('/health', async () => ({ ok: true, service: 'ai' }))

// ---- Agent tools (Phase 3c) — each returns tenant-scoped structured data ----
const TOOLS = {
  search_records: async (tenantId, { q }) => {
    const like = `%${q}%`
    const r = await tenantQuery(tenantId,
      `SELECT order_id, customer, supplier, grade, mt, fcl, price_usd, status FROM records
       WHERE customer ILIKE $1 OR supplier ILIKE $1 OR order_id ILIKE $1 OR grade ILIKE $1
       ORDER BY created_at DESC LIMIT 5`, [like])
    return r.rows
  },
  get_kpi: async (tenantId) => {
    const r = await tenantQuery(tenantId, `SELECT
      count(*)::int AS open_orders, coalesce(sum(mt),0)::float AS active_mt,
      count(DISTINCT supplier)::int AS suppliers, count(DISTINCT customer)::int AS customers
      FROM records`)
    return r.rows[0]
  },
  get_issues: async (tenantId) => {
    const r = await tenantQuery(tenantId, `SELECT ticket_id, category, status, description FROM tickets WHERE status<>'Resolved' ORDER BY created_at DESC LIMIT 5`)
    return r.rows
  },
  get_party: async (tenantId, { q }) => {
    const r = await tenantQuery(tenantId, `SELECT name, type, contact FROM parties WHERE name ILIKE $1 LIMIT 5`, [`%${q}%`])
    return r.rows
  },
  // suggest_chart: aggregates the data and returns a chart spec the UI renders inline.
  suggest_chart: async (tenantId, { dimension, metric = 'count', title, filter }) => {
    const DIMS = { grade: 'grade', customer: 'customer', supplier: 'supplier', status: 'status', category: 'category', type: 'type', month: "to_char(date_trunc('month', date), 'YYYY-MM')" }
    const METRICS = { mt: 'sum(mt)', fcl: 'sum(fcl)', count: 'count(*)', revenue: 'sum(mt*price_usd)', avg_price: 'avg(price_usd)' }
    const dim = DIMS[dimension] || DIMS.customer
    const met = METRICS[metric] || METRICS.count
    let where = '', params = []
    if (filter) { where = 'WHERE grade ILIKE $1 OR customer ILIKE $1 OR supplier ILIKE $1'; params = [`%${filter}%`] }
    const r = await tenantQuery(tenantId,
      `SELECT ${dim} AS label, ${met}::float AS value FROM records ${where} GROUP BY 1 ORDER BY ${dimension === 'month' ? '1 ASC' : '2 DESC'} LIMIT 20`, params)
    return { chart: { type: dimension === 'month' ? 'line' : 'bar', title: title || `${metric} by ${dimension}`, labels: r.rows.map(x => x.label), values: r.rows.map(x => x.value) } }
  },
}

// Multi-turn session store (in-memory, keyed by tenant+session id).
// Keeps the last few turns so follow-ups ("now just TSR-20") can refine.
const sessions = new Map()
function getSession(tenantId, sessionId) {
  const key = `${tenantId}:${sessionId || 'default'}`
  if (!sessions.has(key)) sessions.set(key, { turns: [], lastChart: null })
  return sessions.get(key)
}

// Chart intent detection — keywords that signal a visualization request.
// Multi-turn: if the message has a filter ("now just TSR-20") but no chart
// keywords, and the session has a previous chart, treat it as a refinement.
function detectChartIntent(message, session = null) {
  const m = message.toLowerCase()
  const hasIntent = /(chart|graph|plot|visuali[sz]e|trend|over time|by \w+|compare|breakdown|top \d+|rank|show me.*(by|per|over))/i.test(m)
  // Extract filter first — a bare filter with a prior chart = refine the prior chart.
  const fm = m.match(/(?:for|only|just|just the|show only|now just|now only|filter to)\s+([a-z0-9 -]{2,30})/i)
  const filter = fm ? fm[1].trim() : null
  if (!hasIntent) {
    if (filter && session?.lastChart) return { ...session.lastChart, filter }
    return null
  }
  let dimension = null, metric = 'count'
  if (/by grade|grade.*(breakdown|chart)|per grade/i.test(m)) dimension = 'grade'
  else if (/by supplier|per supplier|supplier.*(breakdown|chart)/i.test(m)) dimension = 'supplier'
  else if (/by status|per status|status.*(breakdown|chart)/i.test(m)) dimension = 'status'
  else if (/by category|per category|category.*(breakdown|chart)/i.test(m)) dimension = 'category'
  else if (/over time|by month|per month|monthly|trend/i.test(m)) dimension = 'month'
  else if (/by type|per type|type.*(breakdown|chart)/i.test(m)) dimension = 'type'
  if (/mt|volume|tonnage/i.test(m)) metric = 'mt'
  else if (/revenue|value|sales|money|\$/i.test(m)) metric = 'revenue'
  else if (/fcl|container/i.test(m)) metric = 'fcl'
  return { dimension: dimension || session?.lastChart?.dimension || 'customer', metric, filter }
}

// Planner: keyword route the message to the right tool(s) — works with the local
// provider. With a real provider this is an LLM tool-call loop (Vercel AI SDK
// `generateText({ tools })`). Returns { toolCalls, observations }.
function plan(message) {
  const m = message.toLowerCase()
  const calls = []
  if (/(issue|quality|problem|defect|moisture|spec|document|shipment)/.test(m)) calls.push({ name: 'get_issues', args: {} })
  if (/(order|buy|sell|tsr|rss|latex|grade|mt|ton|ship|deliver|customer|supplier)/.test(m)) calls.push({ name: 'search_records', args: { q: message } })
  if (/(party|supplier|customer|contact|who|name)/.test(m)) calls.push({ name: 'get_party', args: { q: message } })
  if (/(overview|summary|how many|count|kpi|status|total|metric)/.test(m) || !calls.length) calls.push({ name: 'get_kpi', args: {} })
  return calls
}

// Reindex a tenant's knowledge base into the embeddings table.
fastify.post('/index', async (req) => {
  const tenantId = req.headers['x-tenant-id']
  if (!tenantId) return { error: 'x-tenant-id required' }
  const sources = []
  const recs = await tenantQuery(tenantId,
    `SELECT order_id AS id, 'record' AS type,
            'Order '||order_id||': '||customer||' buying '||mt||' MT of '||grade||' from '||supplier||' at $'||price_usd||'/MT, status '||status AS text
     FROM records`)
  sources.push(...recs.rows)
  const tix = await tenantQuery(tenantId,
    `SELECT ticket_id AS id, 'ticket' AS type,
            'Ticket '||ticket_id||' ('||category||', '||status||'): '||description AS text
     FROM tickets`)
  sources.push(...tix.rows)
  const parties = await tenantQuery(tenantId,
    `SELECT name AS id, 'party' AS type,
            type||' '||name||' contact '||coalesce(contact->>'name', contact::text, 'n/a') AS text
     FROM parties`)
  sources.push(...parties.rows)

  await tenantQuery(tenantId, 'DELETE FROM embeddings')
  let indexed = 0
  for (const s of sources) {
    const vec = embed(s.text)
    await tenantQuery(tenantId,
      `INSERT INTO embeddings (tenant_id, source_type, source_id, metadata, vector)
       VALUES (app.current_tenant(), $1, $2, $3::jsonb, $4::vector)`,
      [s.type, String(s.id), JSON.stringify({ text: s.text }), `[${vec.join(',')}]`])
    indexed++
  }
  return { tenant: tenantId, indexed }
})

// Agentic RAG chat (Phase 3c): plan → tools → retrieve → synthesize, logged.
fastify.post('/chat', async (req, reply) => {
  const { message, session_id } = req.body || {}
  const tenantId = req.headers['x-tenant-id']
  if (!tenantId) return reply.code(400).send({ error: 'x-tenant-id required' })
  if (!message) return reply.code(400).send({ error: 'message required' })

  const t0 = Date.now()
  const requestId = crypto.randomUUID()
  const provider = pickProvider(tenantId)
  const session = getSession(tenantId, session_id)

  // 1) Plan which tools to run. Multi-turn: prepend recent history to context.
  const toolCalls = plan(message)
  const observations = []
  for (const tc of toolCalls) {
    const obs = await TOOLS[tc.name](tenantId, tc.args)
    observations.push({ tool: tc.name, result: obs })
  }

  // 2) Chart intent — detect visualization requests and build a chart spec.
  const chartIntent = detectChartIntent(message, session)
  let chart = null
  if (chartIntent) {
    // Multi-turn: if no explicit filter but a previous chart had one, carry it over.
    if (!chartIntent.filter && session.lastChart?.filter) chartIntent.filter = session.lastChart.filter
    if (!chartIntent.dimension && session.lastChart?.dimension) chartIntent.dimension = session.lastChart.dimension
    const res = await TOOLS.suggest_chart(tenantId, chartIntent)
    chart = res.chart
    session.lastChart = { ...chartIntent, spec: chart }
    observations.push({ tool: 'suggest_chart', result: chart })
  }

  // 3) Semantic retrieval from the knowledge base.
  const vec = embed(message)
  const hits = await tenantQuery(tenantId,
    `SELECT source_type, source_id, metadata->>'text' AS text, 1 - (vector <=> $1::vector) AS score
     FROM embeddings ORDER BY vector <=> $1::vector LIMIT 4`, [`[${vec.join(',')}]`])
  const semantic = hits.rows.filter((r) => r.score > 0)

  // 4) Synthesize. Real provider calls OpenRouter with the gathered context;
  //    local provider = extractive grounded answer.
  let replyText, tokensIn = message.length, tokensOut = 0, costUsd = 0
  const toolNames = observations.map((o) => o.tool)
  const lines = []
  for (const o of observations) {
    if (o.tool === 'search_records' && o.result.length) {
      lines.push(...o.result.map((r) => `• ${r.order_id}: ${r.customer} ${r.grade} ${r.mt}MT from ${r.supplier} (${r.status})`))
    } else if (o.tool === 'get_kpi' && o.result) {
      lines.push(`• KPIs: ${o.result.open_orders} open orders, ${o.result.active_mt} active MT, ${o.result.suppliers} suppliers, ${o.result.customers} customers`)
    } else if (o.tool === 'get_issues' && o.result.length) {
      lines.push(...o.result.map((i) => `• ${i.ticket_id} [${i.category}] ${i.description} (${i.status})`))
    } else if (o.tool === 'get_party' && o.result.length) {
      lines.push(...o.result.map((p) => `• ${p.name} (${p.type})`))
    } else if (o.tool === 'suggest_chart' && o.result.labels?.length) {
      lines.push(`• Chart ready: ${o.result.title} (${o.result.labels.length} bars) — rendered below.`)
    }
  }
  for (const s of semantic) lines.push(`• [${s.source_type} ${s.source_id}] ${s.text}`)
  const context = lines.join('\n')

  // 5) Multi-turn: include recent turns in the LLM prompt.
  const history = session.turns.slice(-4).map((t) => `${t.role}: ${t.text}`).join('\n')

  if (provider.name !== 'local') {
    try {
      const sys = `You are a B2B operations assistant for tenant "${tenantId}". Answer the user's question using ONLY the context below. Be concise and specific. If the context doesn't contain the answer, say so.`
      const result = await llmGenerate(provider, sys, `Recent conversation:\n${history}\n\nContext:\n${context}\n\nQuestion: ${message}`)
      replyText = result.text
      tokensIn = result.tokensIn; tokensOut = result.tokensOut
    } catch (e) {
      fastify.log.warn({ msg: 'LLM call failed, falling back', err: e.message })
      replyText = context ? `Based on ${tenantId}'s data (tools: ${toolNames.join(', ')}):\n${context}` : `I couldn't find anything relevant for "${message}".`
    }
  } else {
    replyText = context
      ? `Based on ${tenantId}'s data (tools: ${toolNames.join(', ')}):\n${context}`
      : `I couldn't find anything relevant for "${message}". Try asking about orders, issues, or suppliers.`
    tokensOut = replyText.length
  }

  const latency = Date.now() - t0
  await logUsage(tenantId, { requestId, provider: provider.name, model: provider.model, tool: toolNames.join(',') || 'planner', tokensIn, tokensOut, costUsd, latencyMs: latency })

  // 6) Record this turn in the session (multi-turn).
  session.turns.push({ role: 'user', text: message }, { role: 'assistant', text: replyText })
  if (session.turns.length > 12) session.turns = session.turns.slice(-12)

  reply.send({
    reply: replyText,
    chart,
    tools: toolNames,
    sources: semantic.map((r) => ({ type: r.source_type, id: r.source_id, score: +r.score.toFixed(3) })),
    usage: { provider: provider.name, model: provider.model, latency_ms: latency, request_id: requestId, tokens_in: tokensIn, tokens_out: tokensOut },
  })
})

// ---- Streaming chat (Phase 3e) — SSE ----
fastify.post('/chat/stream', async (req, reply) => {
  const { message, session_id } = req.body || {}
  const tenantId = req.headers['x-tenant-id']
  if (!tenantId || !message) return reply.code(400).send({ error: 'x-tenant-id and message required' })

  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  })
  const send = (event, data) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  const t0 = Date.now()
  const requestId = crypto.randomUUID()
  const provider = pickProvider(tenantId)
  const session = getSession(tenantId, session_id)

  send('start', { request_id: requestId, provider: provider.name })

  // Plan + run tools, streaming each tool observation as it completes.
  const toolCalls = plan(message)
  const observations = []
  for (const tc of toolCalls) {
    send('tool', { name: tc.name })
    const obs = await TOOLS[tc.name](tenantId, tc.args)
    observations.push({ tool: tc.name, result: obs })
    send('observation', { tool: tc.name, count: Array.isArray(obs) ? obs.length : 1 })
  }

  // Chart intent — detect and stream a chart spec inline.
  const chartIntent = detectChartIntent(message, session)
  let chart = null
  if (chartIntent) {
    if (!chartIntent.filter && session.lastChart?.filter) chartIntent.filter = session.lastChart.filter
    if (!chartIntent.dimension && session.lastChart?.dimension) chartIntent.dimension = session.lastChart.dimension
    send('tool', { name: 'suggest_chart' })
    const res = await TOOLS.suggest_chart(tenantId, chartIntent)
    chart = res.chart
    session.lastChart = { ...chartIntent, spec: chart }
    send('chart', chart)
  }

  // Semantic retrieval.
  const vec = embed(message)
  const hits = await tenantQuery(tenantId,
    `SELECT source_type, source_id, metadata->>'text' AS text, 1 - (vector <=> $1::vector) AS score
     FROM embeddings ORDER BY vector <=> $1::vector LIMIT 4`, [`[${vec.join(',')}]`])
  const semantic = hits.rows.filter((r) => r.score > 0)

  // Synthesize and stream token-by-token (word chunks for the local provider).
  const toolNames = observations.map((o) => o.tool)
  const lines = []
  for (const o of observations) {
    if (o.tool === 'search_records' && o.result.length) lines.push(...o.result.map((r) => `${r.order_id}: ${r.customer} ${r.grade} ${r.mt}MT (${r.status})`))
    else if (o.tool === 'get_kpi' && o.result) lines.push(`KPIs: ${o.result.open_orders} orders, ${o.result.active_mt} MT, ${o.result.suppliers} suppliers`)
    else if (o.tool === 'get_issues' && o.result.length) lines.push(...o.result.map((i) => `${i.ticket_id} [${i.category}] ${i.description}`))
    else if (o.tool === 'get_party' && o.result.length) lines.push(...o.result.map((p) => `${p.name} (${p.type})`))
  }
  if (chart) lines.push(`Chart ready: ${chart.title} — rendered below.`)
  for (const s of semantic) lines.push(`[${s.source_type} ${s.source_id}] ${s.text}`)
  const context = lines.join('\n')

  let tokensOut = 0, tokensIn = 0
  const history = session.turns.slice(-4).map((t) => `${t.role}: ${t.text}`).join('\n')
  if (provider.name !== 'local') {
    // Real LLM: call OpenRouter, then stream the response in word chunks.
    try {
      const sys = `You are a B2B operations assistant for tenant "${tenantId}". Answer using ONLY the context below. Be concise.`
      const result = await llmGenerate(provider, sys, `Recent conversation:\n${history}\n\nContext:\n${context}\n\nQuestion: ${message}`)
      tokensIn = result.tokensIn; tokensOut = result.tokensOut
      const words = result.text.split(/(\s+)/)
      for (const w of words) {
        send('token', { text: w })
        await new Promise((r) => setTimeout(r, 12))
      }
    } catch (e) {
      send('token', { text: `(LLM unavailable: ${e.message.slice(0,80)}) Falling back to data:\n` })
      const fallback = context ? `Based on ${tenantId}'s data:\n${context}` : `Nothing found for "${message}".`
      for (const w of fallback.split(/(\s+)/)) { send('token', { text: w }); await new Promise((r) => setTimeout(r, 8)) }
    }
  } else {
    const full = context ? `Based on ${tenantId}'s data:\n${context}` : `Nothing found for "${message}".`
    for (const w of full.split(/(\s+)/)) {
      send('token', { text: w })
      tokensOut++
      await new Promise((r) => setTimeout(r, 8))
    }
  }
  const latency = Date.now() - t0
  session.turns.push({ role: 'user', text: message }, { role: 'assistant', text: context || 'ok' })
  if (session.turns.length > 12) session.turns = session.turns.slice(-12)
  await logUsage(tenantId, { requestId, provider: provider.name, model: provider.model, tool: toolNames.join(',') || 'planner', tokensIn, tokensOut, costUsd: 0, latencyMs: latency })
  send('done', { tools: toolNames, chart, usage: { provider: provider.name, model: provider.model, latency_ms: latency, request_id: requestId, tokens_in: tokensIn, tokens_out: tokensOut } })
  reply.raw.end()
})

// ---- Insights generator (Phase 3d) — computes and stores a snapshot ----
async function computeInsights(tenantId) {
  const [topCust, topGrade, issueMix, trend, totals] = await Promise.all([
    tenantQuery(tenantId, `SELECT customer, sum(mt)::float AS mt FROM records GROUP BY customer ORDER BY mt DESC LIMIT 3`),
    tenantQuery(tenantId, `SELECT grade, sum(mt)::float AS mt FROM records GROUP BY grade ORDER BY mt DESC LIMIT 3`),
    tenantQuery(tenantId, `SELECT category, count(*)::int AS n FROM tickets GROUP BY category ORDER BY n DESC`),
    tenantQuery(tenantId, `SELECT to_char(date_trunc('month', date),'YYYY-MM') AS m, sum(mt)::float AS mt FROM records GROUP BY 1 ORDER BY 1`),
    tenantQuery(tenantId, `SELECT count(*)::int AS orders, coalesce(sum(mt),0)::float AS mt, coalesce(sum(mt*price_usd),0)::float AS revenue FROM records`),
  ])
  return [
    `Top customer by volume: ${topCust.rows[0]?.customer || 'n/a'} (${topCust.rows[0]?.mt || 0} MT).`,
    `Top grade: ${topGrade.rows[0]?.grade || 'n/a'} (${topGrade.rows[0]?.mt || 0} MT).`,
    `Open issues by category: ${issueMix.rows.map((r) => `${r.category}=${r.n}`).join(', ') || 'none'}.`,
    `Monthly volume trend: ${trend.rows.map((r) => `${r.m}=${r.mt}MT`).join(' → ') || 'n/a'}.`,
    `Totals: ${totals.rows[0].orders} orders, ${totals.rows[0].mt} MT, $${(totals.rows[0].revenue / 1e6).toFixed(2)}M revenue.`,
  ]
}

async function storeSnapshot(tenantId, provider) {
  const insights = await computeInsights(tenantId)
  await tenantQuery(tenantId,
    `INSERT INTO insights_snapshots (tenant_id, insights, provider) VALUES (app.current_tenant(), $1::jsonb, $2)`,
    [JSON.stringify(insights), provider])
  return insights
}

fastify.post('/insights', async (req) => {
  const tenantId = req.headers['x-tenant-id']
  if (!tenantId) return { error: 'x-tenant-id required' }
  const t0 = Date.now()
  const requestId = crypto.randomUUID()
  const provider = pickProvider(tenantId)
  const insights = await storeSnapshot(tenantId, provider.name)
  await logUsage(tenantId, { requestId, provider: provider.name, model: provider.model, tool: 'insights', tokensIn: 0, tokensOut: insights.join(' ').length, costUsd: 0, latencyMs: Date.now() - t0 })
  return { tenant: tenantId, insights, generated_at: new Date().toISOString(), usage: { provider: provider.name, request_id: requestId } }
})

// Latest stored snapshot (loaded automatically by the Insights screen).
fastify.get('/insights/latest', async (req) => {
  const tenantId = req.headers['x-tenant-id']
  if (!tenantId) return { error: 'x-tenant-id required' }
  const r = await tenantQuery(tenantId,
    `SELECT insights, provider, created_at FROM insights_snapshots ORDER BY created_at DESC LIMIT 1`)
  if (!r.rows.length) return { tenant: tenantId, insights: [], note: 'no snapshot yet — call POST /insights' }
  return { tenant: tenantId, insights: r.rows[0].insights, generated_at: r.rows[0].created_at, provider: r.rows[0].provider }
})

// ---- Nightly insights snapshots (cron) ----
// Compute a snapshot for every active tenant so the Insights screen auto-loads.
async function snapshotAllTenants() {
  try {
    const client = await pool.connect()
    let tenants = []
    try {
      const r = await client.query('SELECT id FROM app.tenants WHERE status=$1', ['active'])
      tenants = r.rows.map((t) => t.id)
    } finally { client.release() }
    for (const t of tenants) {
      try { await storeSnapshot(t, 'cron') } catch (e) { fastify.log.warn({ msg: `snapshot failed for ${t}`, err: e.message }) }
    }
    fastify.log.info(`insights snapshots computed for ${tenants.length} tenants`)
  } catch (e) { fastify.log.error('snapshotAllTenants failed', e) }
}
// Run on start + on a schedule (default every 30 min; INSIGHTS_INTERVAL_MS overrides).
const SNAPSHOT_INTERVAL = parseInt(process.env.INSIGHTS_INTERVAL_MS || '1800000', 10)
setTimeout(snapshotAllTenants, 5000)
setInterval(snapshotAllTenants, SNAPSHOT_INTERVAL)

const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' })
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}
start()
