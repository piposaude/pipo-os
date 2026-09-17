import type { ReactNode } from 'react'
import { Card, Heading, Logo, Text } from '@piposaude/design-system'
import './auth-card.css'

export interface AuthCardProps {
  title: string
  subtitle: string
  /** The actions of the screen: the buttons, and whatever has to sit with them. */
  children: ReactNode
  /** Below the rule, where the screen says who to ask. */
  footer: ReactNode
}

/** The card both screens outside the desk are built on — signing in, and being
 *  told there is nothing to sign into. They looked alike by being written
 *  twice, comment included; sharing it is what keeps them alike. */
export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <main className="auth-page">
      <Card
        className="auth-card"
        paddingVertical="var(--pipo-space-large)"
        paddingHorizontal="var(--pipo-space-large)"
      >
        <div className="auth-stack">
          <header className="auth-identity">
            <Logo variant="color" size="sm" />
            <Heading level="h1" textAlign="center" className="auth-title">
              {title}
            </Heading>
            <Text variant="bodySmall" textAlign="center" color="var(--pipo-text-secondary)">
              {subtitle}
            </Text>
          </header>

          {children}

          <footer className="auth-footer">{footer}</footer>
        </div>
      </Card>
    </main>
  )
}
