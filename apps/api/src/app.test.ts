import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'

describe('app', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /health returns ok', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })

  it('returns 404 with a JSON body for unknown routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/does-not-exist' })

    expect(response.statusCode).toBe(404)
  })
})
