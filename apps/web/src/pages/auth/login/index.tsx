import { Banner, Button } from '@piposaude/design-system'
import { Text } from '@piposaude/design-system'
import constants from '@/constants/pages/auth/login'
import { AuthCard } from '../AuthCard'
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
    <AuthCard
      title={constants.title}
      subtitle={constants.subtitle}
      footer={
        <>
          <Text variant="bodySmall" textAlign="center" color="var(--pipo-text-secondary)">
            {constants.footer.domains}
          </Text>
          <Text variant="bodySmall" textAlign="center" color="var(--pipo-text-secondary)">
            {constants.footer.partners}
          </Text>
        </>
      }
    >
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
        {import.meta.env.DEV && <DevLoginButton redirect={redirect} />}
      </div>
    </AuthCard>
  )
}
