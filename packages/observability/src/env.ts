export interface ObservabilityEnvironment {
  dsn?: string
  environment: string
}

export function shouldEnableSentry({ dsn, environment }: ObservabilityEnvironment): boolean {
  return Boolean(dsn) && environment !== 'development' && environment !== 'test'
}
