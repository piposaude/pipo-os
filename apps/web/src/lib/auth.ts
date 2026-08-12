// Single place route guards read auth state from. The login issue replaces
// this stub with a real session check (token storage + session store).
export function isAuthenticated(): boolean {
  return true
}
