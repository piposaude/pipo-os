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
  // Awaited: server.ts exits 1 when this rejects. Port 0, so a `pnpm dev`
  // holding the metrics port cannot fail a check production would pass.
  await startMetricsServer(app, 0)
  await app.ready()
  console.log('boot ok')
} catch (error) {
  console.error('boot failed:', error)
  process.exitCode = 1
} finally {
  await app.close().catch(() => undefined)
}
