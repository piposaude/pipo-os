import type { FastifyInstance } from 'fastify'

// The auth-service's access-token may carry no `sub`. Dev login always sets one,
// so reaching requireUserId's refusal means minting the token by hand — the
// cookie signature is what the API trusts, not the JWT's.
export function sessionWithoutSub(app: FastifyInstance, policies: string[]): string {
  const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url')
  const claims = {
    email: 'dev@piposaude.com.br',
    policies,
    exp: Math.floor(Date.now() / 1000) + 3600,
  }
  const token = `${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims)}.not-a-signature`
  return app.signCookie(token)
}

/** The dev-login route mints one identity, the one in DEV_LOGIN_EMAIL, so a
 *  test that needs two people signs the session itself — same shape, same cookie. */
export function sessionCookieFor(app: FastifyInstance, email: string, policies: string[]): string {
  const now = Math.floor(Date.now() / 1000)
  const part = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url')
  const token = [
    part({ alg: 'none', typ: 'JWT' }),
    part({
      iss: 'pipo-os-test',
      sub: email,
      email,
      iat: now,
      exp: now + 3600,
      policies,
      'token-type': 'access_token',
    }),
    'test-not-a-real-signature',
  ].join('.')

  return app.signCookie(token)
}
