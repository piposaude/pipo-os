/** AbortSignal.timeout is driven by a timer the test runner cannot advance, so
 *  the deadline would be unobservable — and untested. */
export function deadline(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`timed out after ${ms}ms`)), ms)

  return { signal: controller.signal, clear: () => clearTimeout(timer) }
}
