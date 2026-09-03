import { Banner, Button, Card, Heading, Logo, Text } from '@piposaude/design-system'
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
      <Card
        className="login-card"
        paddingVertical="var(--pipo-space-large)"
        paddingHorizontal="var(--pipo-space-large)"
      >
        <header className="login-identity">
          <Logo variant="color" size="sm" />
          <Heading level="h1" textAlign="center" className="login-title">
            {constants.title}
          </Heading>
          <Text variant="bodySmall">{constants.subtitle}</Text>
        </header>

        {message && <Banner variant="alert">{message}</Banner>}

        <div className="login-actions">
          <Button
            variant="primary"
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
        </div>

        <footer className="login-footer">
          <Text variant="bodySmall">{constants.footer.domains}</Text>
          <Text variant="bodySmall">{constants.footer.partners}</Text>
        </footer>
      </Card>
    </main>
  )
}
