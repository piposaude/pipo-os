import { afterEach, describe, expect, it, vi } from 'vitest'
import { isDeployedEnvironment } from './environment.js'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isDeployedEnvironment', () => {
  it.each([['stag'], ['prod'], [' PROD '], ['Stag']])(
    'reads a cluster APP_ENV typed as %s',
    (value) => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('APP_ENV', value)

      expect(isDeployedEnvironment()).toBe(true)
    },
  )

  it('counts NODE_ENV=production on its own, whatever APP_ENV says', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('APP_ENV', '')

    expect(isDeployedEnvironment()).toBe(true)
  })

  it.each([['dev'], [''], [undefined]])('leaves a machine at APP_ENV=%s alone', (value) => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('APP_ENV', value)

    expect(isDeployedEnvironment()).toBe(false)
  })
})
