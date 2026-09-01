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

/**
 * The Pipodesk door. Three things must be visible before the click: where you
 * are, how you get in, who may enter. Typography note: the app name is an h1
 * but NOT display type — the DS h1 is 48px serif and would fight the wordmark
 * right above it. Label, not headline: sans, 24px.
 */
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
          {/* The Logo carries aria-label="Pipo Saúde": the page has an accessible
                         name even before the heading. */}
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
          {/* Statically replaced by Vite: the dev button and its imports leave the
                         production bundle. */}
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
