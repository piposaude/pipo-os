import { createRequire } from 'node:module'
import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyPluginCallback } from 'fastify'
import type { IMetricsPluginOptions } from 'fastify-metrics'

// fastify-metrics não publica um `exports` map nem `"type": "module"`, o que
// confunde a inferência de default-import do TS sob NodeNext; require direto
// evita a ambiguidade e ainda resolve corretamente em runtime ESM.
const require = createRequire(import.meta.url)
const fastifyMetrics: FastifyPluginCallback<Partial<IMetricsPluginOptions>> =
  require('fastify-metrics').default

export interface MetricsPluginOptions {
  endpoint?: string
}

// Business modules criam métricas via `app.metrics.client` (decorado por
// fastify-metrics) para compartilhar o mesmo registry deste plugin, seguindo a
// convenção de nome pipos_<dominio>_<metrica>_<unidade>.
export default fp<MetricsPluginOptions>(
  async function observabilityMetrics(app: FastifyInstance, opts) {
    await app.register(fastifyMetrics, {
      endpoint: opts.endpoint ?? '/metrics',
      // prom-client usa um registry global por processo: limpa antes de registrar
      // para não colidir quando mais de uma instância Fastify sobe no mesmo
      // processo (ex.: apps que constroem múltiplos apps em testes).
      clearRegisterOnInit: true,
    })
  },
  { name: 'observability-metrics' },
)
