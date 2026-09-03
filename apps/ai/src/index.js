import Fastify from 'fastify'

const fastify = Fastify({ logger: true })
const PORT = parseInt(process.env.AI_PORT || '5000', 10)

fastify.setErrorHandler((err, req, reply) => {
  fastify.log.error(err)
  const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500
  reply.code(status).send({ error: true, message: err.message || 'Internal server error' })
})

fastify.get('/health', async () => ({ ok: true, service: 'ai' }))

// Assistant endpoint — stub: wires Vercel AI SDK + providers + tenant scope here
fastify.post('/chat', async (req, reply) => {
  const { message } = req.body || {}
  if (typeof message !== 'string' || !message.trim()) {
    return reply.code(400).send({ error: true, message: 'message is required' })
  }
  const tenantId = req.headers['x-tenant-id']
  // TODO: plug Vercel AI SDK 5 with provider router + tenant-scoped tools
  reply.send({ reply: `Assistant stub — tenant ${tenantId || 'unknown'} said: ${message}` })
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
