// Mirrors APP_ENV in .k8s/raw/{stag,prod}: a tier added there is added here.
const DEPLOYED_APP_ENVS = new Set(['stag', 'prod'])

export const appEnv = (): string => (process.env.APP_ENV ?? '').trim().toLowerCase()

export function isDeployedEnvironment(): boolean {
  return process.env.NODE_ENV === 'production' || DEPLOYED_APP_ENVS.has(appEnv())
}

/** The refusal every dev-only secret owes a deployed pod. Presence stays with
 *  the caller: a flag is read as `=== 'true'`, a secret as any non-blank value. */
export function assertNotSetInDeployed(name: string): void {
  if (isDeployedEnvironment()) {
    throw new Error(
      `${name} must never be set in a deployed environment ` +
        `(NODE_ENV=${process.env.NODE_ENV}, APP_ENV=${appEnv() || '<unset>'})`,
    )
  }
}
