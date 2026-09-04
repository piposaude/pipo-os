import { useState } from 'react'
import { Button } from '@piposaude/design-system'
import { devLogin } from '@/lib/api/dev-login'
import constants from '@/constants/pages/auth/login/dev'

export interface DevLoginButtonProps {
  redirect?: string
}

// Rendered only behind `import.meta.env.DEV`, which Vite replaces statically —
// this component is dropped from the production bundle at build time.
export function DevLoginButton({ redirect }: DevLoginButtonProps) {
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState(false)

  const handleClick = async () => {
    setPending(true)
    setFailed(false)
    try {
      await devLogin()
      // Full navigation, like the Google flow: the session store rehydrates
      // from /api/auth/me on the fresh page load.
      window.location.assign(redirect ?? '/')
    } catch {
      setFailed(true)
      setPending(false)
    }
  }

  return (
    <>
      <Button variant="secondary" loading={pending} onClick={handleClick}>
        {constants.button}
      </Button>
      {failed && (
        <span className="login-dev-error" role="alert">
          {constants.unavailable}
        </span>
      )}
    </>
  )
}
