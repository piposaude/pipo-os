import { useEffect, useMemo, useState } from 'react'
import { QueueHeader } from '@/components/pipodesk/queue/QueueHeader'
import { QueueTable } from '@/components/pipodesk/queue/QueueTable'
import { BatchBar, type PodOption } from '@/components/pipodesk/queue/BatchBar'
import styles from '@/components/pipodesk/queue/Queue.module.css'
import { useDesk } from '@/components/pipodesk/shell/desk-context'
import {
  applyColumnPrefs,
  columnsFor,
  DEFAULT_COLUMN_PREFS,
  moveColumn,
  readColumnPrefs,
  type ColumnPrefs,
} from '@/lib/pipodesk/columns'
import { applyFilter, sinceOf, windowOf, type FilterField } from '@/lib/pipodesk/filter'
import type { LabelContext } from '@/lib/pipodesk/filter-copy'
import { filterChipsOf } from '@/lib/pipodesk/filter-copy'
import { groupTickets } from '@/lib/pipodesk/group'
import { sortTickets } from '@/lib/pipodesk/sort'
import { isSearchNode, pillsOf, type TreeNode, type TreeSection } from '@/lib/pipodesk/tree'
import { toQueueNode } from '@/lib/pipodesk/queue-node'
import { ANALYSTS_BY_POD, structureFixture, VIEWER_GROUP_ID } from '@/fixtures/pipodesk/dataset'
import constants from '@/constants/pages/pipodesk/queue'

const COLUMN_PREFS_KEY = 'pipodesk:columns'

/** Node by id, at any depth. */
function findNode(sections: TreeSection[], id: string): TreeNode | null {
  const walk = (nodes: TreeNode[]): TreeNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node
      const found = walk(node.children)
      if (found) return found
    }
    return null
  }
  for (const section of sections) {
    const found = walk(section.nodes)
    if (found) return found
  }
  return null
}

/**
 * The operational queue. The order of operations IS the sidebar contract:
 * node scope, window, filter, sort, group. Cut differently and the sidebar
 * number stops describing the list.
 */
export default function QueuePage() {
  const {
    sections,
    view,
    dispatch,
    rows,
    today,
    viewerId,
    resolveName,
    sidebarCollapsed,
    toggleSidebar,
    applyPatch,
  } = useDesk()

  /* Node base: scope + window, before the filter — what the panel counts
       per option against. */
  const base = useMemo(() => {
    const scoped =
      view.groupId === null ? rows : rows.filter((ticket) => ticket.groupId === view.groupId)
    const awake = windowOf(scoped, view.windowMode, today)
    // The opening window cuts the base BEFORE the filter — viewer preference,
    // not a chip. The panel counts follow; the sidebar's do not, a registered
    // divergence: the node counts the set, the window cuts what is viewed now.
    if (view.dateWindowDays === null) return awake
    const since = sinceOf(view.dateWindowDays, today)
    return awake.filter((ticket) => ticket.createdAt >= since)
  }, [rows, view.groupId, view.windowMode, view.dateWindowDays, today])

  const listed = useMemo(
    () => applyFilter(base, view.filter, viewerId),
    [base, view.filter, viewerId],
  )

  const groups = useMemo(
    () => groupTickets(sortTickets(listed, view.sort), view.groupBy, resolveName),
    [listed, view.sort, view.groupBy, resolveName],
  )

  const total = listed.length

  /* Names derived from the rows — all there is until GET /companies (PD-054)
       and the users module (PD-060). */
  const ctx = useMemo<LabelContext>(() => {
    const companies = new Map<string, string>()
    const carriers = new Map<string, string>()
    for (const row of rows) {
      if (row.companyName) companies.set(row.companyId, row.companyName)
      if (row.carrierId && row.carrierName) carriers.set(row.carrierId, row.carrierName)
    }
    return {
      companyName: (id) => companies.get(id) ?? id,
      carrierName: (id) => carriers.get(id) ?? id,
      userName: resolveName,
    }
  }, [rows, resolveName])

  const chips = useMemo(
    () => filterChipsOf(view.filter, view.nodeFilter, ctx),
    [view.filter, view.nodeFilter, ctx],
  )

  /* The owner column only shows when owners mix — one face repeated on every
       row is wasted width. */
  const showAssignee = useMemo(() => {
    const owners = new Set(listed.map((ticket) => ticket.assigneeId))
    return owners.size > 1
  }, [listed])

  /* Column prefs belong to the person, not the queue — they survive node
       switches and reloads. try/catch: storage may be unavailable. */
  const [columnPrefs, setColumnPrefs] = useState<ColumnPrefs>(() => {
    try {
      const stored = localStorage.getItem(COLUMN_PREFS_KEY)
      return stored ? readColumnPrefs(JSON.parse(stored)) : DEFAULT_COLUMN_PREFS
    } catch {
      return DEFAULT_COLUMN_PREFS
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(columnPrefs))
    } catch {
      // No persistence available: the session still honors the choice.
    }
  }, [columnPrefs])

  const allColumns = columnsFor(showAssignee)
  const columns = applyColumnPrefs(allColumns, columnPrefs)
  const visibleColumnKeys = columns.map((column) => column.key)

  const pills = pillsOf(sections, view.nodeId)
  const select = (node: TreeNode) => dispatch({ type: 'select-node', node: toQueueNode(node) })

  /* Effective selection = intersection with the listed rows: an action that
       removes rows from the queue empties the selection with them. */
  const listedIds = useMemo(() => new Set(listed.map((ticket) => ticket.id)), [listed])
  const selectedVisible = view.selectedIds.filter((id) => listedIds.has(id))

  const runBatch = (patch: Parameters<typeof applyPatch>[1]) => {
    applyPatch(selectedVisible, patch)
  }

  /* The pod the queue is showing, not the viewer's. Nodes outside a pod
       (Meus tickets, Todos) have no owner pod, so the viewer's own answers. */
  const analysts = (ANALYSTS_BY_POD[view.groupId ?? VIEWER_GROUP_ID] ?? []).map((id) => ({
    id,
    name: resolveName(id),
  }))
  const pods: PodOption[] = structureFixture.groups
    .filter((group) => group.parentId !== null)
    .map((group) => ({
      id: group.id,
      name: group.name,
      analysts: (ANALYSTS_BY_POD[group.id] ?? []).map((id) => ({ id, name: resolveName(id) })),
    }))

  return (
    <div className={styles.screen}>
      <QueueHeader
        labelPath={view.labelPath}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={toggleSidebar}
        pills={pills}
        activeNodeId={view.nodeId}
        onSelectPill={select}
        onExitSearch={
          isSearchNode(view.nodeId)
            ? () => {
                const home = findNode(sections, 'node-meus-tickets')
                if (home) select(home)
              }
            : undefined
        }
        base={base}
        filter={view.filter}
        viewerId={viewerId}
        ctx={ctx}
        chips={chips}
        onApplyFilter={(field: FilterField, values) =>
          dispatch({ type: 'add-filter', field, values })
        }
        onRemoveFilter={(field: FilterField) => dispatch({ type: 'remove-filter', field })}
        dateWindowDays={view.dateWindowDays}
        onSetDateWindow={(days) => dispatch({ type: 'set-date-window', days, today })}
        groupBy={view.groupBy}
        onSetGroupBy={(groupBy) => dispatch({ type: 'set-group-by', groupBy })}
        sort={view.sort}
        onSort={(sort) => dispatch({ type: 'set-sort', sort })}
        availableColumns={allColumns
          .filter((column) => column.key !== 'select')
          .map((column) => ({ key: column.key, label: column.label }))}
        hiddenColumns={columnPrefs.hidden}
        onToggleColumn={(key) =>
          setColumnPrefs((prefs) => ({
            ...prefs,
            hidden: prefs.hidden.includes(key)
              ? prefs.hidden.filter((hidden) => hidden !== key)
              : [...prefs.hidden, key],
          }))
        }
        visibleColumnKeys={visibleColumnKeys}
        onMoveColumn={(key, direction) =>
          setColumnPrefs((prefs) => ({
            ...prefs,
            order: moveColumn(prefs.order, visibleColumnKeys, key, direction),
          }))
        }
      />

      {/* The total left the visible header (the sidebar shows it) but not the
                 screen reader. */}
      <p className={styles.live} role="status">
        {constants.liveCount(total, view.label)}
      </p>

      <QueueTable
        groups={groups}
        columns={columns}
        sort={view.sort}
        onSort={(sort) => dispatch({ type: 'set-sort', sort })}
        collapsedGroups={view.collapsedGroups}
        onToggleGroup={(key) => dispatch({ type: 'toggle-group', key })}
        selectedIds={selectedVisible}
        onToggleTicket={(id) => dispatch({ type: 'toggle-ticket', id })}
        onSelectAll={(ids) => dispatch({ type: 'set-selection', ids })}
        today={today}
        resolveName={resolveName}
      />

      {/* Mounted only while something is selected: the panel keeps which screen
          is open, and it used to come back on the last one, date and all. */}
      {selectedVisible.length > 0 && (
        <BatchBar
          selectedCount={selectedVisible.length}
          matchingCount={total}
          selectAllMatching={selectedVisible.length === total && total > 0}
          onSelectAllMatching={() =>
            dispatch({ type: 'set-selection', ids: listed.map((ticket) => ticket.id) })
          }
          onClear={() => dispatch({ type: 'clear-selection' })}
          analysts={analysts}
          onAssign={(userId) => runBatch({ assigneeId: userId })}
          pods={pods}
          onMoveToPod={(groupId, userId) => runBatch({ groupId, assigneeId: userId })}
          onStatus={(status) => runBatch({ status })}
          onSchedule={(date) => runBatch({ actionDate: date })}
        />
      )}
    </div>
  )
}
