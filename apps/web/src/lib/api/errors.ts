// Normalized shape for every non-2xx response coming out of the API client.
// The raw server message is kept for debugging/observability; user-facing
// copy always comes from the page's constants (pt-BR).
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}
