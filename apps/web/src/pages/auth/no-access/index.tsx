import { useNavigate } from '@tanstack/react-router'
import { Button, Card, Heading, Logo, Text } from '@piposaude/design-system'
import { logout } from '@/lib/auth'
import constants from '@/constants/pages/auth/no-access'
import './style.css'

/** Shown to someone who has a session but no Pipodesk policy. Deliberately
 *  outside the desk layout: the shell would offer a queue this visitor cannot
 *  read, and every request behind it would answer 403. */
export default function NoAccessPage() {
  const navigate = useNavigate()

  const leave = () => {
    void logout()
      .catch(() => {
        // The store drops the local session anyway; leaving matters more.
      })
      .finally(() => navigate({ to: '/login' }))
  }

  return (
    <main className="no-access-page">
      <Card
        className="no-access-card"
        paddingVertical="var(--pipo-space-large)"
        paddingHorizontal="var(--pipo-space-large)"
      >
        <div className="no-access-stack">
          <header className="no-access-identity">
            <Logo variant="color" size="sm" />
            <Heading level="h1" textAlign="center" className="no-access-title">
              {constants.title}
            </Heading>
            <Text variant="bodySmall" textAlign="center" color="var(--pipo-text-secondary)">
              {constants.subtitle}
            </Text>
          </header>

          <Button variant="secondary" onClick={leave}>
            {constants.logout}
          </Button>

          <footer className="no-access-footer">
            <Text variant="bodySmall" textAlign="center" color="var(--pipo-text-secondary)">
              {constants.help}
            </Text>
          </footer>
        </div>
      </Card>
    </main>
  )
}
