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
