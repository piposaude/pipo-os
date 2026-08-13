import { Banner, Button, Card, Logo } from '@piposaude/design-system'
import constants from '@/constants/pages/auth/login'
import { DevLoginButton } from './DevLoginButton'
import { GoogleIcon } from './GoogleIcon'
import './style.css'

type LoginErrorCode = keyof typeof constants.errors

export interface LoginPageProps {
  redirect?: string
  error?: string
}

function errorMessage(code: string | undefined): string | null {
  if (!code) {
    return null
  }
  return constants.errors[code as LoginErrorCode] ?? constants.errors.generic
}

export default function LoginPage({ redirect, error }: LoginPageProps) {
  const googleHref = `/api/auth/google${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`
  const message = errorMessage(error)

  return (
    <main className="login-page">
      <Card className="login-card">
        {/* The Logo carries aria-label="Pipo Saúde", so the page keeps an
            accessible name even without a visible heading. */}
        <Logo variant="color" size="lg" />
        {message && <Banner variant="alert">{message}</Banner>}
        <Button
          variant="secondary"
          leftIcon={<GoogleIcon />}
          onClick={() => {
            window.location.assign(googleHref)
          }}
        >
          {constants.googleButton}
        </Button>
        {/* Statically replaced by Vite: the dev button and everything it
            imports are eliminated from the production bundle. */}
        {import.meta.env.DEV && <DevLoginButton redirect={redirect} />}
      </Card>
    </main>
  )
}
