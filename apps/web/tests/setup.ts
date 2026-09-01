import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'

// In the jsdom environment, fetch/Request come from undici (Node) while
// AbortController comes from jsdom, and undici rejects foreign signals at
// Request construction time. Cancellation is irrelevant in tests, so drop the
// signal instead of letting every request throw before reaching fetch.
const NativeRequest = globalThis.Request

class TestRequest extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    if (init?.signal) {
      const rest = { ...init }
      delete rest.signal
      super(input, rest)
    } else {
      super(input, init)
    }
  }
}

vi.stubGlobal('Request', TestRequest)

// jsdom has no ResizeObserver, and the queue table measures its scroll area.
// Observing nothing is correct here: the initial height comes from state.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Direct assignment, not vi.stubGlobal: an unstubAllGlobals() in a test file
// would erase the stub for the tests after it.
globalThis.ResizeObserver = NoopResizeObserver as unknown as typeof ResizeObserver

// This jsdom build exposes no `localStorage`, so every preference the app
// stores was dead code under test — CI's jsdom has it and broke on the state
// one test left behind. An in-memory Storage runs the real path here too.
if (typeof globalThis.localStorage === 'undefined') {
  const entries = new Map<string, string>()
  const memoryStorage: Storage = {
    get length() {
      return entries.size
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => void entries.delete(key),
    setItem: (key, value) => void entries.set(key, String(value)),
  }
  globalThis.localStorage = memoryStorage
}

afterEach(() => {
  cleanup()
  // Preferences (collapsed sidebar, columns) outlive a render: without this,
  // one test's choice becomes the next test's starting screen.
  try {
    localStorage.clear()
  } catch {
    // No storage in this environment: nothing to reset.
  }
})
