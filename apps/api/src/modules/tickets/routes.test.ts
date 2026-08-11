import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'

describe('tickets routes', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await app.db.deleteFrom('tickets').execute()
  })

  describe('GET /api/tickets', () => {
    it('returns an empty list when there are no tickets', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/tickets' })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual([])
    })

    it('returns existing tickets ordered by most recent', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { title: 'First', description: 'First ticket' },
      })
      await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { title: 'Second', description: 'Second ticket' },
      })

      const response = await app.inject({ method: 'GET', url: '/api/tickets' })

      expect(response.statusCode).toBe(200)
      const tickets = response.json()
      expect(tickets).toHaveLength(2)
      expect(tickets[0].title).toBe('Second')
      expect(tickets[1].title).toBe('First')
    })
  })

  describe('POST /api/tickets', () => {
    it('creates a ticket with default status', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { title: 'Título', description: 'Descrição' },
      })

      expect(response.statusCode).toBe(201)
      const ticket = response.json()
      expect(ticket).toMatchObject({
        title: 'Título',
        description: 'Descrição',
        status: 'open',
      })
      expect(ticket.id).toBeTypeOf('string')
      expect(ticket.createdAt).toBeTypeOf('string')
    })

    it('creates a ticket with an explicit status', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { title: 'Título', description: 'Descrição', status: 'closed' },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().status).toBe('closed')
    })

    it('returns 400 when required fields are missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { title: 'Só título' },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe('RequestValidationError')
    })

    it('returns 400 when status is invalid', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { title: 'Título', description: 'Descrição', status: 'invalid' },
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('PUT /api/tickets/:id', () => {
    async function createTicket() {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { title: 'Original', description: 'Descrição original' },
      })
      return response.json()
    }

    it('updates only the provided fields', async () => {
      const created = await createTicket()

      const response = await app.inject({
        method: 'PUT',
        url: `/api/tickets/${created.id}`,
        payload: { status: 'in_progress' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        id: created.id,
        title: 'Original',
        description: 'Descrição original',
        status: 'in_progress',
      })
    })

    it('returns 404 when the ticket does not exist', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/tickets/00000000-0000-0000-0000-000000000000',
        payload: { status: 'closed' },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json().error).toBe('NotFoundError')
    })

    it('returns 400 when the id is not a valid uuid', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/tickets/not-a-uuid',
        payload: { status: 'closed' },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 when the body has no fields to update', async () => {
      const created = await createTicket()

      const response = await app.inject({
        method: 'PUT',
        url: `/api/tickets/${created.id}`,
        payload: {},
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe('RequestValidationError')
    })
  })

  describe('DELETE /api/tickets/:id', () => {
    it('deletes an existing ticket', async () => {
      const created = await app
        .inject({
          method: 'POST',
          url: '/api/tickets',
          payload: { title: 'Para remover', description: 'Descrição' },
        })
        .then((response) => response.json())

      const response = await app.inject({ method: 'DELETE', url: `/api/tickets/${created.id}` })

      expect(response.statusCode).toBe(204)
      expect(response.body).toBe('')

      const list = await app.inject({ method: 'GET', url: '/api/tickets' })
      expect(list.json()).toEqual([])
    })

    it('returns 404 when the ticket does not exist', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/tickets/00000000-0000-0000-0000-000000000000',
      })

      expect(response.statusCode).toBe(404)
      expect(response.json().error).toBe('NotFoundError')
    })
  })
})
