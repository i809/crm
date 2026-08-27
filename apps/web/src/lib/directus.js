// RLS-aware Directus client for the Next.js web app.
// Tenant isolation is enforced at the DB (Postgres RLS); this client is the
// soft second layer that carries the tenant context so the BFF can set the
// RLS session before any query lands. See docs/architecture/overview.md.
//
// Flow: login → Directus JWT + user.tenant_id → every request sends
// x-tenant-id header → BFF does SET app.tenant_id → RLS filters rows.

import { createDirectus, rest, authentication, readItems, createItem, updateItem, deleteItem, readMe } from '@directus/sdk'

const DIRECTUS_URL = process.env.NEXT_PUBLIC_DIRECTUS_URL || 'http://localhost:8055'

let _client = null
let _tenantId = null
let _token = null

function buildClient() {
  return createDirectus(DIRECTUS_URL).with(authentication('json', { credentials: 'include' })).with(rest())
}

export function getClient() {
  if (!_client) _client = buildClient()
  return _client
}

// Login + cache tenant binding. The BFF reads user.tenant_id (set at onboarding)
// to bind the RLS session; we also send it as x-tenant-id for the soft layer.
export async function login(email, password) {
  const client = getClient()
  const res = await client.login(email, password)
  _token = res.access_token
  const me = await client.request(readMe({ fields: ['id', 'first_name', 'role', 'tenant_id'] }))
  _tenantId = me.tenant_id || null
  return { user: me, tenantId: _tenantId, token: _token }
}

export function setTenant(tenantId) { _tenantId = tenantId }
export function getTenant() { return _tenantId }
export function logout() { _token = null; _tenantId = null; return getClient().logout() }

export function tenantHeaders() {
  return _tenantId ? { 'x-tenant-id': _tenantId } : {}
}

// ---- RLS-aware collection helpers (the "SDK hooks" for custom screens) ----
export async function list(collection, query = {}) {
  return getClient().request(readItems(collection, { ...query }))
}
export async function create(collection, item) {
  return getClient().request(createItem(collection, item))
}
export async function update(collection, id, item) {
  return getClient().request(updateItem(collection, id, item))
}
export async function remove(collection, id) {
  return getClient().request(deleteItem(collection, id))
}

export const Records = {
  list: (q) => list('records', q),
  get: (id) => list('records', { filter: { id } }),
  create: (item) => create('records', item),
  update: (id, item) => update('records', id, item),
  remove: (id) => remove('records', id),
}

export const Parties = {
  list: (q) => list('parties', q),
  suppliers: () => list('parties', { filter: { type: { _eq: 'supplier' } } }),
  customers: () => list('parties', { filter: { type: { _eq: 'customer' } } }),
  create: (item) => create('parties', item),
  update: (id, item) => update('parties', id, item),
}

export const Tickets = {
  list: (q) => list('tickets', q),
  open: () => list('tickets', { filter: { status: { _neq: 'Resolved' } } }),
  create: (item) => create('tickets', item),
  update: (id, item) => update('tickets', id, item),
}

export const Feed = { list: (q) => list('feed_items', q), create: (item) => create('feed_items', item) }
export const Checklists = { list: (q) => list('checklists', q), update: (id, item) => update('checklists', id, item) }
export const Files = { list: (q) => list('files', q), create: (item) => create('files', item) }
export const HR = { list: (q) => list('hr_events', q) }
