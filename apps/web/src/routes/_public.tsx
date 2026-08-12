import { createFileRoute } from '@tanstack/react-router'

// Pathless layout for unauthenticated flows (login, error fallbacks).
export const Route = createFileRoute('/_public')({})
