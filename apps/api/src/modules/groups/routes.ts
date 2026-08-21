import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { UnauthorizedError } from '../../shared/errors.js'
import { SESSION_COOKIE_NAME, extractSessionClaims, type SessionClaims } from '../auth/session.js'
import {
  addMemberBodySchema,
  createGroupBodySchema,
  errorResponseSchema,
  groupListSchema,
  groupMemberSchema,
  groupParamsSchema,
  groupSchema,
  listGroupsQuerySchema,
  memberParamsSchema,
  updateGroupBodySchema,
  updateMemberBodySchema,
} from './schemas.js'
import type { GroupsService } from './service.js'

function getSession(request: FastifyRequest): SessionClaims {
  const rawCookie = request.cookies[SESSION_COOKIE_NAME]
  const unsigned = rawCookie ? request.unsignCookie(rawCookie) : null
  const claims = unsigned?.valid && unsigned.value ? extractSessionClaims(unsigned.value) : null

  if (!claims) {
    throw new UnauthorizedError('Not authenticated')
  }

  return claims
}

export function registerGroupRoutes(app: FastifyInstance, service: GroupsService): void {
  const server = app.withTypeProvider<ZodTypeProvider>()

  server.post(
    '/api/groups',
    {
      schema: {
        body: createGroupBodySchema,
        response: { 201: groupSchema, 400: errorResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const claims = getSession(request)
      const group = await service.create(request.body, claims.sub ?? claims.email)
      reply.status(201)
      return group
    },
  )

  server.get(
    '/api/groups',
    {
      schema: {
        querystring: listGroupsQuerySchema,
        response: { 200: groupListSchema, 401: errorResponseSchema },
      },
    },
    async (request) => {
      getSession(request)
      return service.list(request.query)
    },
  )

  server.get(
    '/api/groups/:id',
    {
      schema: {
        params: groupParamsSchema,
        response: { 200: groupSchema, 401: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => {
      getSession(request)
      return service.get(request.params.id)
    },
  )

  server.patch(
    '/api/groups/:id',
    {
      schema: {
        params: groupParamsSchema,
        body: updateGroupBodySchema,
        response: {
          200: groupSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      getSession(request)
      return service.update(request.params.id, request.body)
    },
  )

  server.delete(
    '/api/groups/:id',
    {
      schema: {
        params: groupParamsSchema,
        response: { 204: z.null(), 401: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      getSession(request)
      await service.delete(request.params.id)
      reply.status(204)
      return null
    },
  )

  server.post(
    '/api/groups/:id/users',
    {
      schema: {
        params: groupParamsSchema,
        body: addMemberBodySchema,
        response: {
          201: groupMemberSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      getSession(request)
      const member = await service.addMember(request.params.id, request.body)
      reply.status(201)
      return member
    },
  )

  server.delete(
    '/api/groups/:id/users/:userId',
    {
      schema: {
        params: memberParamsSchema,
        response: { 204: z.null(), 401: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      getSession(request)
      await service.removeMember(request.params.id, request.params.userId)
      reply.status(204)
      return null
    },
  )

  server.patch(
    '/api/groups/:id/users/:userId',
    {
      schema: {
        params: memberParamsSchema,
        body: updateMemberBodySchema,
        response: {
          200: groupMemberSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      getSession(request)
      return service.updateMember(request.params.id, request.params.userId, request.body)
    },
  )
}
