import { useMemo, useState } from 'react'
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Heading,
  Loading,
  Text,
} from '@piposaude/design-system'
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useDesk } from '@/components/pipodesk/shell/desk-context'
import { SidebarToggle } from '@/components/pipodesk/shell/SidebarToggle'
import { ancestorsOf, canEditStructure, rootGroupOf } from '@/lib/pipodesk/permissions'
import { findNode, listNodeIdOf } from '@/lib/pipodesk/tree'
import { toQueueNode } from '@/lib/pipodesk/queue-node'
import { unownedCompaniesOf } from '@/lib/pipodesk/team'
import type { LabelContext } from '@/lib/pipodesk/filter-copy'
import { CarteirasTab } from './CarteirasTab'
import { MemberTable } from './MemberTable'
import { AddPersonModal } from './AddPersonModal'
import { TeamMenu } from './TeamMenu'
import { InlineRename } from '@/components/pipodesk/sidebar/InlineRename'
import { ViewsTab } from './ViewsTab'
import { windowOf } from '@/lib/pipodesk/filter'
import { COMPANY_NAMES } from '@/fixtures/pipodesk/dataset'
import constants from '@/constants/pages/pipodesk/team'
import sidebarConstants from '@/constants/pipodesk/sidebar'
import styles from './style.module.css'

/**
 * A pod's Home: who is on the team, with how much portfolio and load. The
 * unowned-companies warning sits ABOVE the table — it is the group's one
 * coordination debt, and a warning inside the tab you already opened warns
 * nobody. Read-only; editing is the rest of PD-105.
 */
export default function TeamPage() {
  const { groupId } = useParams({ from: '/_auth/_desk/teams/$groupId' })
  /* `validateSearch` already restricted this to the two tabs or nothing —
     re-checking here would be a second source of truth for the same rule. */
  const { tab = 'home' } = useSearch({ from: '/_auth/_desk/teams/$groupId' })
  const {
    structure,
    structurePending,
    rows,
    rowsTotal,
    rowsTruncated,
    resolveName,
    today,
    sections,
    dispatch,
    openSaveView,
    viewerId,
    groupWrites,
  } = useDesk()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState(false)

  const group = structure.groups.find((candidate) => candidate.id === groupId)

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

  /* At the root the roster is every pod's people, so their load is too. */
  const awake = useMemo(() => windowOf(rows, 'awake', today), [rows, today])

  const openCount = inGroup.length
  /* Memoized like `inGroup` they derive from: both walk the structure and the
     pod's open tickets, and the page re-renders on every context change. */
  const unowned = useMemo(
    () => unownedCompaniesOf(structure, groupId, inGroup),
    [structure, groupId, inGroup],
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
        {structurePending ? (
          <Loading show variant="contained" role="status" />
        ) : (
          <Text>{constants.notFound}</Text>
        )}
      </div>
    )
  }

  const isRoot = group.parentId === null
  const canEdit = canEditStructure(structure, viewerId, group.id)

  const startNewView = () => {
    const node = findNode(sections, listNodeIdOf(group.id, rootGroupOf(structure)))
    if (!node) return
    dispatch({ type: 'select-node', node: toQueueNode(node) })
    void navigate({ to: '/' })
    openSaveView(group.id)
  }

  const trail = [...ancestorsOf(structure, groupId)].reverse()
  /* The breadcrumb, not a tab bar, says which section you are on (DSP-93):
     outside Home it ends in the section and the group becomes the way back. */
  const section = tab === 'home' ? null : sidebarConstants.adminLinks[tab]
  const crumbs = [
    ...trail.map((ancestor) => (
      <BreadcrumbItem key={ancestor.id}>
        <Link to="/teams/$groupId" params={{ groupId: ancestor.id }}>
          {ancestor.name}
        </Link>
      </BreadcrumbItem>
    )),
    section === null ? (
      <BreadcrumbItem key={group.id} current>
        {group.name}
      </BreadcrumbItem>
    ) : (
      <BreadcrumbItem key={group.id}>
        <Link to="/teams/$groupId" params={{ groupId: group.id }} search={{}}>
          {group.name}
        </Link>
      </BreadcrumbItem>
    ),
    ...(section === null
      ? []
      : [
          <BreadcrumbItem key="section" current>
            {section}
          </BreadcrumbItem>,
        ]),
  ]

  return (
    <div className={styles.screen}>
      <div className={styles.topbar}>
        <SidebarToggle />
        <Breadcrumb separator="›">{crumbs}</Breadcrumb>
      </div>

      <header className={styles.pagehead}>
        <div className={styles.titulo}>
          <div className={styles.nome}>
            {renaming ? (
              <InlineRename
                className={styles.rename}
                value={group.name}
                onCommit={(name) => {
                  setRenaming(false)
                  if (name !== group.name) groupWrites.renameGroup(group.id, name)
                }}
                onCancel={() => setRenaming(false)}
              />
            ) : (
              <Heading level="h1">
                <span
                  onDoubleClick={() => {
                    if (canEdit) setRenaming(true)
                  }}
                >
                  {group.name}
                </span>
              </Heading>
            )}
            {canEdit && !renaming && (
              <TeamMenu name={group.name} onRename={() => setRenaming(true)} />
            )}
          </div>
          <Text variant="bodySmall" className={styles.sub}>
            {constants.open(openCount)}
          </Text>
        </div>
        {tab === 'views' ? (
          <div className={styles.acao}>
            <Button variant="primary" onClick={startNewView}>
              {constants.newView}
            </Button>
          </div>
        ) : tab === 'home' && canEdit ? (
          <div className={styles.acao}>
            <Button variant="primary" onClick={() => setAdding(true)}>
              {constants.addPerson.button}
            </Button>
          </div>
        ) : (
          // Saying WHO edits keeps read-only from reading as broken — otherwise
          // people hunt for a button that does not exist.
          <p className={styles.acao}>{constants.editableBy(group.name)}</p>
        )}
      </header>

      {rowsTruncated && (
        <p className={styles.truncated} role="status">
          {constants.truncated(rows.length, rowsTotal)}
        </p>
      )}

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
          <MemberTable
            group={group}
            isRoot={isRoot}
            structure={structure}
            rows={isRoot ? awake : inGroup}
            resolveName={resolveName}
            canEdit={canEdit}
            onSetRole={(userId, role) => groupWrites.setMemberRole(group.id, userId, role)}
            onRemove={(userId) => groupWrites.removeMember(group.id, userId)}
          />
        )}
        {tab === 'portfolios' && (
          <CarteirasTab
            structure={structure}
            groupId={groupId}
            rows={inGroup}
            companyName={ctx.companyName}
            resolveName={resolveName}
          />
        )}
        {tab === 'views' && (
          <ViewsTab structure={structure} groupId={groupId} rows={inGroup} ctx={ctx} />
        )}
      </div>
      {adding && <AddPersonModal group={group} isRoot={isRoot} onClose={() => setAdding(false)} />}
    </div>
  )
}
