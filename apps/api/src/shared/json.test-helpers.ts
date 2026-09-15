/** What `fetch` returns, for tests that stub it. Kept in one place because a
 *  copy per suite drifts the moment the mocked contract gains a field. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** One page of the auth-service people listing. `total` counts the whole
 *  listing, not the page, so a paginated one has to state it. */
export function usersPage(
  users: unknown[],
  nextCursor: string | null = null,
  total = users.length,
): Response {
  return jsonResponse({ users, total, 'next-cursor': nextCursor })
}
