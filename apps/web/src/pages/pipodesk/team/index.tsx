import { useMemo } from 'react'
import {
  Avatar,
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  Heading,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Text,
} from '@piposaude/design-system'
import { Link, useParams, useSearch } from '@tanstack/react-router'
import { useDesk } from '@/components/pipodesk/shell/desk-context'
import { ancestorsOf } from '@/lib/pipodesk/permissions'
import { membersWithLoad, unownedCompaniesOf } from '@/lib/pipodesk/team'
import type { LabelContext } from '@/lib/pipodesk/filter-copy'
import { CarteirasTab } from './CarteirasTab'
import { ViewsTab } from './ViewsTab'
import { windowOf } from '@/lib/pipodesk/filter'
import { COMPANY_NAMES, structureFixture } from '@/fixtures/pipodesk/dataset'
import constants from '@/constants/pages/pipodesk/team'
import styles from './style.module.css'

/**
 * A pod's Home: who is on the team, with how much portfolio and load. The
 * unowned-companies warning sits ABOVE the table — it is the group's one
 * coordination debt, and a warning inside the tab you already opened warns
 * nobody. Read-only; editing is the rest of PD-105.
 */
const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

export default function TeamPage() {
  const { groupId } = useParams({ from: '/_auth/_desk/teams/$groupId' })
  /* `validateSearch` already restricted this to the two tabs or nothing —
     re-checking here would be a second source of truth for the same rule. */
  const { tab = 'home' } = useSearch({ from: '/_auth/_desk/teams/$groupId' })
  const { rows, resolveName, today } = useDesk()

  const group = structureFixture.groups.find((candidate) => candidate.id === groupId)

  /* The SAME awake base the tree counts — counting differently is how the
       illegitimate subtraction is born (51 here vs 41 in the menu). */
  const inGroup = useMemo(
    () =>
      windowOf(
        rows.filter((row) => row.groupId === groupId),
        'awake',
        today,
      ),
    [rows, groupId, today],
  )

  const openCount = inGroup.length
  /* Memoized like `inGroup` they derive from: both walk the structure and the
     pod's open tickets, and the page re-renders on every context change. */
  const unowned = useMemo(
    () => unownedCompaniesOf(structureFixture, groupId, inGroup),
    [groupId, inGroup],
  )
  const members = useMemo(
    () => membersWithLoad(structureFixture, groupId, inGroup),
    [groupId, inGroup],
  )

  const ctx = useMemo<LabelContext>(() => {
    const companies = new Map<string, string>()
    for (const row of rows) {
      if (row.companyName) companies.set(row.companyId, row.companyName)
    }
    return {
      // The dataset catalog covers companies with no tickets — exactly the case
      // triage and a fresh portfolio show.
      companyName: (id) => companies.get(id) ?? COMPANY_NAMES[id] ?? id,
      carrierName: (id) => id,
      userName: resolveName,
    }
  }, [rows, resolveName])
  if (!group) {
    return (
      <div className={`${styles.screen} ${styles.missing}`}>
        <Text>{constants.notFound}</Text>
      </div>
    )
  }

  const trail = [...ancestorsOf(structureFixture, groupId)].reverse()

  return (
    <div className={styles.screen}>
      <div className={styles.topbar}>
        <Breadcrumb separator="›">
          {/* Every ancestor is a group with its own page now, so the trail
                         navigates instead of just describing. */}
          {trail.map((ancestor) => (
            <BreadcrumbItem key={ancestor.id}>
              <Link to="/teams/$groupId" params={{ groupId: ancestor.id }}>
                {ancestor.name}
              </Link>
            </BreadcrumbItem>
          ))}
          <BreadcrumbItem current>{group.name}</BreadcrumbItem>
        </Breadcrumb>
      </div>

      <header className={styles.pagehead}>
        <div className={styles.titulo}>
          <Heading level="h1">{group.name}</Heading>
          <Text variant="bodySmall" className={styles.sub}>
            {constants.open(openCount)}
          </Text>
        </div>
        {/* Saying WHO edits keeps read-only from reading as broken — otherwise
                     people hunt for a button that does not exist. */}
        <p className={styles.acao}>{constants.editableBy(group.name)}</p>
      </header>

      {/* `note`, not `status`: the count is fixed at load, and a live region with
               nothing to announce competes with the text for the accessible name. */}
      {unowned.companies > 0 && (
        <div className={styles.pendencia} role="note" aria-label={constants.unowned.label}>
          <div className={styles.pendenciaTexto}>
            <strong>{constants.unowned.title(unowned.companies, unowned.tickets)}</strong>
            <span>{constants.unowned.body}</span>
          </div>
        </div>
      )}

      <div className={styles.secao}>
        {tab === 'home' && (
          <>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{constants.table.person}</TableHeaderCell>
                  <TableHeaderCell>{constants.table.role}</TableHeaderCell>
                  <TableHeaderCell>{constants.table.portfolio}</TableHeaderCell>
                  <TableHeaderCell align="right">{constants.table.open}</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.userId}>
                    <TableCell>
                      <span className={styles.person}>
                        {/* alt="" on purpose: the name renders next to it in the same cell — an
                                                   alt would read the person twice. The queue's owner
                                                   column is the opposite: there the avatar is alone. */}
                        <Avatar size="sm" text={initialsOf(resolveName(member.userId))} alt="" />
                        {resolveName(member.userId)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {/* `tertiary`, not `primary`: solid green with light text reads as a
                                               button, not an attribute, in a 20px badge. */}
                      <Badge
                        variant={member.role === 'admin' ? 'tertiary' : 'neutral'}
                        size="small"
                      >
                        {constants.roles[member.role]}
                      </Badge>
                    </TableCell>
                    {/* Coordination without portfolio is "not applicable", not zero — a `0`
                                           would read as an empty portfolio to fill. */}
                    <TableCell>
                      {member.companies === 0 && member.role === 'admin' ? (
                        <span className={styles.muted}>{constants.noPortfolio}</span>
                      ) : (
                        constants.portfolio(member.companies)
                      )}
                    </TableCell>
                    <TableCell align="right" className={styles.num}>
                      {member.open}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
        {tab === 'portfolios' && (
          <CarteirasTab
            structure={structureFixture}
            groupId={groupId}
            rows={inGroup}
            companyName={ctx.companyName}
            resolveName={resolveName}
          />
        )}
        {tab === 'views' && (
          <ViewsTab structure={structureFixture} groupId={groupId} rows={inGroup} ctx={ctx} />
        )}
      </div>
    </div>
  )
}
