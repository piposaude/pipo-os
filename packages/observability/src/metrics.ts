import { createRequire } from 'node:module'
import fp from 'fastify-plugin'
import Fastify, { type FastifyInstance, type FastifyPluginCallback } from 'fastify'
import type { IMetricsPluginOptions } from 'fastify-metrics'

// fastify-metrics não publica um `exports` map nem `"type": "module"`, o que
// confunde a inferência de default-import do TS sob NodeNext; require direto
// evita a ambiguidade e ainda resolve corretamente em runtime ESM.
const require = createRequire(import.meta.url)
const fastifyMetrics: FastifyPluginCallback<Partial<IMetricsPluginOptions>> =
  require('fastify-metrics').default

// Convenção Pipo: métricas Prometheus ficam numa porta dedicada, separada do
// tráfego de negócio.
export const METRICS_PORT = 8080

// Business modules criam métricas via `app.metrics.client` (decorado por
// fastify-metrics) para compartilhar o mesmo registry deste plugin, seguindo a
// convenção de nome pipos_<dominio>_<metrica>_<unidade>.
export default fp(
  async function observabilityMetrics(app: FastifyInstance) {
    await app.register(fastifyMetrics, {
      // /metrics não é exposto nesta instância: fica só no server dedicado
      // (ver startMetricsServer), na porta de métricas.
      endpoint: null,
      // prom-client usa um registry global por processo: limpa antes de registrar
      // para não colidir quando mais de uma instância Fastify sobe no mesmo
      // processo (ex.: apps que constroem múltiplos apps em testes).
      clearRegisterOnInit: true,
    })
  },
  { name: 'observability-metrics' },
)

export async function startMetricsServer(
  app: FastifyInstance,
  port: number = METRICS_PORT,
): Promise<FastifyInstance> {
  const metricsApp = Fastify({ logger: false })
  metricsApp.get('/metrics', async (_request, reply) => {
    reply.header('content-type', app.metrics.client.register.contentType)
    return app.metrics.client.register.metrics()
  })

  // Fastify trava novos hooks assim que o boot termina (ready()/listen()) —
  // registrar antes de aguardar o ready garante que isso não corra contra o
  // app.listen() do chamador.
  app.addHook('onClose', async () => {
    await metricsApp.close()
  })

  await app.ready()
  await metricsApp.listen({ port, host: '0.0.0.0' })

  return metricsApp
}
