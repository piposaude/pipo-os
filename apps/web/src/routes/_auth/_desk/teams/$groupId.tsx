import { createFileRoute } from '@tanstack/react-router'
import TeamPage from '@/pages/pipodesk/team'

/** The tabs the URL admits. `home` is the absence of the param, not a value —
 *  the default tab needs no search string. */
export const TEAM_TABS = ['portfolios', 'views'] as const
export type TeamTab = (typeof TEAM_TABS)[number]

/** A real type guard, not a comparison: `search.tab` is `unknown`, which `===`
 *  does not narrow — that is why every consumer used to re-check what this
 *  function had already decided. */
const isTeamTab = (value: unknown): value is TeamTab =>
  typeof value === 'string' && (TEAM_TABS as readonly string[]).includes(value)

export const Route = createFileRoute('/_auth/_desk/teams/$groupId')({
  // `?tab=` is the page's internal navigation — same pathname, different
  // search. English like the rest of the URL; the UI still says "Carteiras".
  validateSearch: (search: Record<string, unknown>): { tab?: TeamTab } => ({
    tab: isTeamTab(search.tab) ? search.tab : undefined,
  }),
  component: TeamPage,
})
