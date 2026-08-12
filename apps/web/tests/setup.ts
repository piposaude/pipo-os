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

afterEach(() => {
  cleanup()
})
