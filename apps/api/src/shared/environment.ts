// Mirrors APP_ENV in .k8s/raw/{stag,prod}: a tier added there is added here.
const DEPLOYED_APP_ENVS = new Set(['stag', 'prod'])

export const appEnv = (): string => (process.env.APP_ENV ?? '').trim().toLowerCase()

export function isDeployedEnvironment(): boolean {
  return process.env.NODE_ENV === 'production' || DEPLOYED_APP_ENVS.has(appEnv())
}
