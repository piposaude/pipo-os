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
