import type { ReactNode } from 'react'
import { Card, Heading, Logo, Text } from '@piposaude/design-system'
import './auth-card.css'

export interface AuthCardProps {
  title: string
  subtitle: string
  /** The actions of the screen, between the header and the footer. */
  children: ReactNode
  /** Below the divider, where the screen says who to ask. */
  footer: ReactNode
}

/** The card shared by the two screens outside the desk: login and no-access. */
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

          {/* Typed as required, but ReactNode still admits null: an empty
              footer would draw the divider with nothing under it. */}
          {footer && <footer className="auth-footer">{footer}</footer>}
        </div>
      </Card>
    </main>
  )
}
