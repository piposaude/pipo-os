import { ConflictError } from '../../shared/errors.js'

/** Keeps the `ConflictError` name the response already carried: the id is an
 *  addition to the body, not a new error for the caller to learn. */
export class OpenTicketConflictError extends ConflictError {
  readonly ticketId?: string

  constructor(message: string, ticketId?: string) {
    super(message)
    this.name = 'ConflictError'
    this.ticketId = ticketId
  }
}
