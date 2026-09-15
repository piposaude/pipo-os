// Boots outside the test runner, where the suite cannot look: inside vitest the
// autoload skips test files, so a file that only breaks the boot passes green.
import { startMetricsServer } from '@pipo-os/observability/metrics'
import { initSentryNode } from '@pipo-os/observability/sentry-node'

// `src` under tsx needs no build and reaches the same modules; `dist` is what
// the image runs.
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
