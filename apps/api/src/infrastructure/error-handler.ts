import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from '@fastify/type-provider-zod'
import fp from 'fastify-plugin'
import { DomainError } from '../shared/errors.js'

export default fp(
  async function errorHandlerPlugin(app) {
    app.setErrorHandler((error, request, reply) => {
      if (hasZodFastifySchemaValidationErrors(error)) {
        reply.status(400).send({
          error: 'RequestValidationError',
          message: 'Request validation failed',
          details: error.validation,
        })
        return
      }

      if (isResponseSerializationError(error)) {
        request.log.error(error)
        reply.status(500).send({
          error: 'ResponseSerializationError',
          message: 'Response failed to match the schema',
        })
        return
      }

      if (error instanceof DomainError) {
        reply.status(error.statusCode).send({
          error: error.name,
          message: error.message,
        })
        return
      }

      request.log.error(error)
      reply.status(500).send({
        error: 'InternalServerError',
        message: 'Something went wrong',
      })
    })
  },
  { name: 'error-handler' },
)
