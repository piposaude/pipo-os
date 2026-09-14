import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireUserId } from '../auth/authenticate.js'
import { errorResponseSchema } from '../../shared/schemas.js'
import { STRUCTURE_POLICY } from '../auth/policy.js'
import {
  addMemberBodySchema,
  createGroupBodySchema,
  groupDetailSchema,
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

export function registerGroupRoutes(app: FastifyInstance, service: GroupsService): void {
  const server = app.withTypeProvider<ZodTypeProvider>()

  server.post(
    '/api/groups',
    {
      config: { policy: STRUCTURE_POLICY },
      schema: {
        body: createGroupBodySchema,
        response: {
          201: groupSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          413: errorResponseSchema,
          415: errorResponseSchema,
          422: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const createdBy = requireUserId(request)
      const group = await service.create(request.body, createdBy)
      reply.status(201)
      return group
    },
  )

  server.get(
    '/api/groups',
    {
      config: { policy: STRUCTURE_POLICY },
      schema: {
        querystring: listGroupsQuerySchema,
        response: {
          200: groupListSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request) => {
      return service.list(request.query)
    },
  )

  server.get(
    '/api/groups/:id',
    {
      config: { policy: STRUCTURE_POLICY },
      schema: {
        params: groupParamsSchema,
        response: {
          200: groupDetailSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      return service.get(request.params.id)
    },
  )

  server.patch(
    '/api/groups/:id',
    {
      config: { policy: STRUCTURE_POLICY },
      schema: {
        params: groupParamsSchema,
        body: updateGroupBodySchema,
        response: {
          200: groupSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          413: errorResponseSchema,
          415: errorResponseSchema,
          422: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const updatedBy = requireUserId(request)
      return service.update(request.params.id, request.body, updatedBy)
    },
  )

  server.delete(
    '/api/groups/:id',
    {
      config: { policy: STRUCTURE_POLICY },
      schema: {
        params: groupParamsSchema,
        response: {
          204: z.null(),
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await service.delete(request.params.id)
      reply.status(204)
      return null
    },
  )

  server.post(
    '/api/groups/:id/members',
    {
      config: { policy: STRUCTURE_POLICY },
      schema: {
        params: groupParamsSchema,
        body: addMemberBodySchema,
        response: {
          201: groupMemberSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          413: errorResponseSchema,
          415: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const member = await service.addMember(request.params.id, request.body)
      reply.status(201)
      return member
    },
  )

  server.delete(
    '/api/groups/:id/members/:memberId',
    {
      config: { policy: STRUCTURE_POLICY },
      schema: {
        params: memberParamsSchema,
        response: {
          204: z.null(),
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await service.removeMember(request.params.id, request.params.memberId)
      reply.status(204)
      return null
    },
  )

  server.patch(
    '/api/groups/:id/members/:memberId',
    {
      config: { policy: STRUCTURE_POLICY },
      schema: {
        params: memberParamsSchema,
        body: updateMemberBodySchema,
        response: {
          200: groupMemberSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          413: errorResponseSchema,
          415: errorResponseSchema,
        },
      },
    },
    async (request) => {
      return service.updateMember(request.params.id, request.params.memberId, request.body)
    },
  )
}
