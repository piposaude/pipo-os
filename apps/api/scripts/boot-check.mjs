// Keep this out of vitest: inside the runner the autoload skips test files, so
// a boot broken by one of them passes green.
import { startMetricsServer } from '@pipo-os/observability/metrics'
import { initSentryNode } from '@pipo-os/observability/sentry-node'

const from = process.argv[2] === 'src' ? '../src/app.ts' : '../dist/app.js'

const { buildApp } = await import(from)

// Before buildApp, as server.ts does: the Node instrumentation is order-bound.
initSentryNode()

const app = buildApp()

try {
  // Awaited, because server.ts exits 1 when this rejects. Ephemeral port, so a
  // `pnpm dev` holding the metrics port cannot fail a boot production would not.
  await startMetricsServer(app, 0)
  await app.ready()
  console.log('boot ok')
} catch (error) {
  console.error('boot failed:', error)
  process.exitCode = 1
} finally {
  await app.close().catch(() => undefined)
}
