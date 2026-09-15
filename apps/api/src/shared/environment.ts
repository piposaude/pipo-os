/** `stag` and `prod`, the two APP_ENV values that run in the cluster. */
const DEPLOYED_APP_ENVS = new Set(['stag', 'prod'])

export const appEnv = (): string => (process.env.APP_ENV ?? '').trim().toLowerCase()

/** Two boot guards hang off this — the dev login, which mints a session with no
 *  Google and no auth-service, and a pasted service token, which never rotates.
 *  Written twice, a tier added to one copy silently stops protecting the other. */
export function isDeployedEnvironment(): boolean {
  return process.env.NODE_ENV === 'production' || DEPLOYED_APP_ENVS.has(appEnv())
}
