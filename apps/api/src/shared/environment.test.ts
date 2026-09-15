import { afterEach, describe, expect, it, vi } from 'vitest'
import { isDeployedEnvironment } from './environment.js'

afterEach(() => {
  vi.unstubAllEnvs()
})

/* One function now answers for both boot guards — the dev login and a pasted
   service token — so a regression here disarms the two at once. */
describe('isDeployedEnvironment', () => {
  it('reads a cluster APP_ENV however it was typed', () => {
    for (const value of ['stag', 'prod', ' PROD ', 'Stag']) {
      vi.stubEnv('APP_ENV', value)
      expect(isDeployedEnvironment()).toBe(true)
    }
  })

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
