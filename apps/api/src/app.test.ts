import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('app', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /health returns ok when the database is reachable', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })

  it('GET /health returns 503 when the database is unreachable', async () => {
    const unhealthyApp = buildApp()
    await unhealthyApp.ready()
    // Kysely only marks its driver as destroyed if it was already initialized by a
    // prior query, so we need one real query before destroying to make the pool
    // unreachable instead of silently reconnecting on the next call.
    await unhealthyApp.inject({ method: 'GET', url: '/health' })
    await unhealthyApp.db.destroy()

    const response = await unhealthyApp.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({ status: 'unavailable' })

    await unhealthyApp.close()
  })

  it('returns 404 with a JSON body for unknown routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/does-not-exist' })

    expect(response.statusCode).toBe(404)
  })

  it('generates a random UUID as request id when no x-request-id header is sent', async () => {
    const testApp = buildApp()
    let capturedId: string | undefined
    testApp.addHook('onRequest', async (request) => {
      capturedId = request.id
    })
    await testApp.ready()

    await testApp.inject({ method: 'GET', url: '/health' })
    await testApp.close()

    expect(capturedId).toMatch(UUID_PATTERN)
  })

  it('reuses the incoming x-request-id header value as the request id', async () => {
    const testApp = buildApp()
    let capturedId: string | undefined
    testApp.addHook('onRequest', async (request) => {
      capturedId = request.id
    })
    await testApp.ready()

    await testApp.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'client-provided-id' },
    })
    await testApp.close()

    expect(capturedId).toBe('client-provided-id')
  })
})
