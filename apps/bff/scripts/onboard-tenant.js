#!/usr/bin/env node
// Onboard a new tenant: node apps/bff/scripts/onboard-tenant.js <tenant-name> [--template=<slug>] [--no-seed]
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { onboard } from '../src/scaffold.js'

const TEMPLATE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'infra', 'templates')

const args = process.argv.slice(2)
const [name, ...flags] = args
const askedHelp = args.includes('--help') || args.includes('-h')

if (askedHelp || !name) {
  console.log(`Usage: node apps/bff/scripts/onboard-tenant.js <tenant-name> [--template=<slug>] [--no-seed]

  <tenant-name>      name of the new tenant (required)
  --template=<slug>  template to clone (default: rubbertrack)
  --no-seed          skip sample data

Requires env: DIRECTUS_URL (default http://localhost:8055), ADMIN_EMAIL, ADMIN_PASSWORD.
Tip: run from the repo root with: node --env-file=.env apps/bff/scripts/onboard-tenant.js <tenant-name>`)
  process.exit(askedHelp ? 0 : 1)
}

const templateFlag = flags.find((f) => f.startsWith('--template='))
const template = templateFlag ? templateFlag.split('=')[1] : 'rubbertrack'
const seed = !flags.includes('--no-seed')

if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
  console.error('Onboarding failed: ADMIN_EMAIL and ADMIN_PASSWORD must be set (see .env.example).')
  process.exit(1)
}

try {
  const result = await onboard(name, { template, seed, templateDir: TEMPLATE_DIR })
  console.log(`Tenant "${result.tenant}" onboarded from template "${result.template}" (seeded: ${result.seeded}).`)
} catch (err) {
  console.error(`Onboarding failed: ${err.message}`)
  if (err.errors?.length) console.error(`  ${err.errors[0].message}`)
  process.exit(1)
}
