import { Button, Logo, Text } from '@piposaude/design-system'
import { useNavigate } from '@tanstack/react-router'
import { logout } from '@/lib/auth'
import { useSessionStore } from '@/stores/session'
import constants from '@/constants/layout/auth-top-bar'
import styles from './AuthTopBar.module.css'

export function AuthTopBar() {
  const navigate = useNavigate()
  const email = useSessionStore((state) => state.user?.email)

  const handleLogout = async () => {
    await logout()
    navigate({ to: '/login' })
  }

  return (
    <header className={styles.bar}>
      <Logo size="sm" />
      <div className={styles.actions}>
        {email && <Text variant="bodySmall">{email}</Text>}
        <Button variant="ghost" onClick={handleLogout}>
          {constants.logout}
        </Button>
      </div>
    </header>
  )
}
