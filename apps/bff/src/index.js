import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'

const fastify = Fastify({ logger: true })
const PORT = parseInt(process.env.BFF_PORT || '4000', 10)

await fastify.register(cors, { origin: true })
await fastify.register(helmet)

fastify.setErrorHandler((err, req, reply) => {
  fastify.log.error(err)
  const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500
  reply.code(status).send({ error: true, message: err.message || 'Internal server error' })
})

fastify.get('/health', async () => ({ ok: true, service: 'bff' }))

// Tenant-detection middleware — stub: resolves tenant from Authorization header in v2
fastify.addHook('preHandler', async (req) => {
  // TODO: parse JWT (Directus) and set req.tenantId; for dev, accept header for testing
  req.tenantId = req.headers['x-tenant-id'] || null
})

// Proxy to AI service (approve the AI contexts)
fastify.post('/ai/chat', async (req, reply) => {
  const headers = { 'content-type': 'application/json' }
  if (req.tenantId) headers['x-tenant-id'] = req.tenantId
  let res
  try {
    res = await fetch(`${process.env.AI_SERVICE_URL || 'http://localhost:5000'}/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body ?? {})
    })
  } catch (err) {
    return reply.code(502).send({ error: true, message: 'AI service unreachable' })
  }
  const body = await res.text()
  reply.code(res.status).type(res.headers.get('content-type') || 'application/json').send(body)
})

const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' })
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}
start()
