import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const run = promisify(execFile)

// Outside the runner on purpose: see scripts/boot-check.mjs.
describe('the application', () => {
  it('boots outside the test runner', async () => {
    const apiRoot = path.join(import.meta.dirname, '..')

    // One process, not `pnpm exec`: the timeout must kill the boot, not a wrapper.
    const { stdout } = await run(
      process.execPath,
      ['--import', 'tsx', 'scripts/boot-check.mjs', 'src'],
      { cwd: apiRoot, timeout: 50_000 },
    )

    expect(stdout).toContain('boot ok')
  }, 60_000)
})
