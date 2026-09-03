// Tenant onboarding helper (Directus SDK)
import { createDirectus, rest, authentication, createItem, createItems, createCollection, createRoles } from '@directus/sdk'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROLES = ['tenant-admin', 'staff-sales', 'staff-logistics', 'staff-documentation', 'staff-technical', 'customer']

function getClient() {
  const url = process.env.DIRECTUS_URL || 'http://localhost:8055'
  return createDirectus(url).with(rest()).with(authentication('json'))
}

// Template JSON uses the friendly `key` name for fields; Directus expects `field`.
export function buildTemplatePayload(template) {
  const collections = {}
  for (const [name, def] of Object.entries(template.collections)) {
    const fields = (def.fields || [])
      .filter((f) => f && f.type)
      .map(({ key, field, type, meta }) => ({ field: key || field, type, ...(meta ? { meta } : {}) }))
    collections[name] = { collection: name, fields }
  }
  return collections
}

/**
 * Create tenant + clone template + roles + sample data.
 * argv: tenantName --template=rubbertrack
 */
export async function onboard(tenantName, { template = 'rubbertrack', seed = true, templateDir = 'infra/templates' } = {}) {
  const client = getClient()
  await client.login({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })

  const payload = JSON.parse(readFileSync(join(templateDir, `${template}.json`), 'utf8'))

  // 1) Create tenant record (directus_users model: tenants)
  await client.request(createItem('tenants', { name: tenantName }))

  // 2) Apply template collections
  for (const def of Object.values(buildTemplatePayload(payload))) {
    await client.request(createCollection(def))
  }

  // 3) Create roles
  await client.request(createRoles(ROLES.map((name) => ({ name }))))

  // 4) Apply permission presets (rooted to tenant)
  // TODO: presets in v2

  if (seed) await seedSample(client, template)
  return { tenant: tenantName, template, seeded: seed }
}

async function seedSample(client, template) {
  if (template !== 'rubbertrack') return
  const records = [
    { order_id: 'ORD-2026-0039', date: '2026-08-01', customer: 'BKT', supplier: 'Lexley Rubber', grade: 'T30M', mt: 50.4, fcl: 2, price_usd: 2240 },
    { order_id: 'ORD-2026-0042', date: '2026-08-10', customer: 'JK Tyre', supplier: 'Tiong Huat', grade: 'TSR-20', mt: 100.8, fcl: 4, price_usd: 1875 },
  ]
  await client.request(createItems('records', records))
}
