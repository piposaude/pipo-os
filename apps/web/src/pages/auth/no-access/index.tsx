import { useNavigate } from '@tanstack/react-router'
import { Button, Text } from '@piposaude/design-system'
import { logout } from '@/lib/auth'
import constants from '@/constants/pages/auth/no-access'
import { AuthCard } from '../AuthCard'

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
    <AuthCard
      title={constants.title}
      subtitle={constants.subtitle}
      footer={
        <Text variant="bodySmall" textAlign="center" color="var(--pipo-text-secondary)">
          {constants.help}
        </Text>
      }
    >
      <Button variant="secondary" onClick={leave}>
        {constants.logout}
      </Button>
    </AuthCard>
  )
}
