export abstract class DomainError extends Error {
  abstract readonly statusCode: number
}

export class NotFoundError extends DomainError {
  readonly statusCode = 404

  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

/** A parameter the schema cannot check on its own — an opaque cursor, say.
 *  Same status the Zod validation layer already returns for a bad query. */
export class BadRequestError extends DomainError {
  readonly statusCode = 400

  constructor(message: string) {
    super(message)
    this.name = 'BadRequestError'
  }
}

export class UnauthorizedError extends DomainError {
  readonly statusCode = 401

  constructor(message: string) {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export class ConflictError extends DomainError {
  readonly statusCode = 409

  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}

export class UnprocessableEntityError extends DomainError {
  readonly statusCode = 422

  constructor(message: string) {
    super(message)
    this.name = 'UnprocessableEntityError'
  }
}
