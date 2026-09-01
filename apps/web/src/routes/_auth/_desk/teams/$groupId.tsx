import { createFileRoute } from '@tanstack/react-router'
import TeamPage from '@/pages/pipodesk/team'

export const Route = createFileRoute('/_auth/_desk/teams/$groupId')({
  // `?tab=` is the page's internal navigation — same pathname, different
  // search. English like the rest of the URL; the UI still says "Carteiras".
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search.tab === 'portfolios' || search.tab === 'views' ? (search.tab as string) : undefined,
  }),
  component: TeamPage,
})
