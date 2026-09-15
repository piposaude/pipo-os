// Keep this out of vitest: inside the runner the autoload skips test files, so
// a boot broken by one of them passes green.
import { startMetricsServer } from '@pipo-os/observability/metrics'
import { initSentryNode } from '@pipo-os/observability/sentry-node'

const from = process.argv[2] === 'src' ? '../src/app.ts' : '../dist/app.js'

const { buildApp } = await import(from)

const app = buildApp()

try {
  // The same order server.ts uses: the metrics hook is registered before ready.
  initSentryNode()
  // Awaited, because server.ts exits 1 when this rejects: swallowed, the check
  // would print `boot ok` for a process that dies in production. On an ephemeral
  // port, so a `pnpm dev` already holding the metrics port cannot fail it for a
  // reason production would not have.
  await startMetricsServer(app, 0)
  await app.ready()
  console.log('boot ok')
} catch (error) {
  console.error('boot failed:', error)
  process.exitCode = 1
} finally {
  await app.close().catch(() => undefined)
}
