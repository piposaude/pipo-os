import { startMetricsServer } from '@pipo-os/observability/metrics'
import { initSentryNode } from '@pipo-os/observability/sentry-node'
import { buildApp } from './app.js'

initSentryNode()

const PORT = Number(process.env.PORT ?? 3001)

const app = buildApp()

// Chamado antes de app.listen(): registra o onClose do metrics server
// enquanto o app ainda aceita hooks (Fastify trava isso após o boot).
const metricsServerReady = startMetricsServer(app)

app.listen({ port: PORT, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})

metricsServerReady.catch((err) => {
  app.log.error(err, 'failed to start metrics server')
  process.exit(1)
})
