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
