/** What `fetch` returns, for tests that stub it. Kept in one place because a
 *  copy per suite drifts the moment the mocked contract gains a field. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
