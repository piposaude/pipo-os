import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import type { FastifyInstance } from 'fastify'
import { companyServiceInternalUrl, getCompanies } from '../../infrastructure/company-service.js'
import { errorResponseSchema } from '../../shared/schemas.js'
import { STRUCTURE_POLICY, TICKET_POLICY } from '../auth/policy.js'
import { companyListSchema, listCompaniesQuerySchema } from './schemas.js'

export function registerCompanyRoutes(app: FastifyInstance): void {
  const server = app.withTypeProvider<ZodTypeProvider>()

  server.get(
    '/api/companies',
    {
      config: { policy: [TICKET_POLICY, STRUCTURE_POLICY] },
      schema: {
        querystring: listCompaniesQuerySchema,
        response: {
          200: companyListSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const ids = [...new Set(request.query.ids ?? [])]
      const companies = await getCompanies({
        baseUrl: companyServiceInternalUrl(),
        ids,
        logger: request.log,
      })

      return { data: companies }
    },
  )
}
