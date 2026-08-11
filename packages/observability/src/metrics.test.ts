import { Counter, Registry } from 'prom-client'
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { startMetricsServer } from './metrics.js'

describe('startMetricsServer', () => {
  let metricsApp: FastifyInstance | undefined

  afterEach(async () => {
    await metricsApp?.close()
    metricsApp = undefined
  })

  it('serves the shared prom-client registry on its own server', async () => {
    const register = new Registry()
    new Counter({
      name: 'pipos_test_requests_total',
      help: 'test counter',
      registers: [register],
    }).inc()

    const fakeApp = {
      ready: async () => {},
      addHook: () => {},
      metrics: { client: { register } },
    } as unknown as FastifyInstance

    metricsApp = await startMetricsServer(fakeApp, 0)
    const response = await metricsApp.inject({ method: 'GET', url: '/metrics' })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/plain')
    expect(response.body).toContain('pipos_test_requests_total 1')
  })
})
