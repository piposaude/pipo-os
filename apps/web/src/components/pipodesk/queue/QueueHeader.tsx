import { useState, useRef } from 'react'
import { Breadcrumb, BreadcrumbItem } from '@piposaude/design-system'
import { hasCustomColumns } from '@/lib/pipodesk/columns'
import { FILTER_FIELD_COPY, type FilterChip, type LabelContext } from '@/lib/pipodesk/filter-copy'
import type { FilterField, TicketFilter } from '@/lib/pipodesk/filter'
import type { GroupBy } from '@/lib/pipodesk/group'
import type { TicketSort } from '@/lib/pipodesk/sort'
import type { TicketRow } from '@/lib/pipodesk/ticket-row'
import type { TreeNode } from '@/lib/pipodesk/tree'
import constants from '@/constants/pages/pipodesk/queue'
import { SidebarToggle } from '@/components/pipodesk/shell/SidebarToggle'
import { DisplayPopover } from './DisplayPopover'
import { FilterPopover } from './FilterPopover'
import styles from './Queue.module.css'

/**
 * Queue top band: breadcrumb of the active node plus the pill row. Pills are
 * the active node's siblings, not panel tabs — clicking one is the same
 * `select-node` as the sidebar, hence `aria-current` and no `role="tab"`. The
 * count is not repeated here; screen readers get it from the live region.
 */
export interface QueueHeaderProps {
  labelPath: string[]
  pills: TreeNode[]
  activeNodeId: string
  onSelectPill: (node: TreeNode) => void
  /** Set only when the queue came from search — the one queue with no lit
   *  sidebar node, so the only one needing its own exit. */
  onExitSearch?: () => void
  /* Filter panel. */
  base: TicketRow[]
  filter: TicketFilter
  viewerId: string
  ctx: LabelContext
  chips: FilterChip[]
  onApplyFilter: (field: FilterField, values: string[]) => void
  onRemoveFilter: (field: FilterField) => void
  dateWindowDays: number | null
  onSetDateWindow: (days: number | null) => void
  /* Display panel. */
  groupBy: GroupBy
  onSetGroupBy: (groupBy: GroupBy) => void
  sort: TicketSort
  onSort: (sort: TicketSort) => void
  availableColumns: { key: string; label: string }[]
  hiddenColumns: string[]
  onToggleColumn: (key: string) => void
  visibleColumnKeys: string[]
  onMoveColumn: (key: string, direction: -1 | 1) => void
}

export function QueueHeader({
  labelPath,
  pills,
  activeNodeId,
  onSelectPill,
  onExitSearch,
  base,
  filter,
  viewerId,
  ctx,
  chips,
  onApplyFilter,
  onRemoveFilter,
  dateWindowDays,
  onSetDateWindow,
  groupBy,
  onSetGroupBy,
  sort,
  onSort,
  availableColumns,
  hiddenColumns,
  onToggleColumn,
  visibleColumnKeys,
  onMoveColumn,
}: QueueHeaderProps) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [displayOpen, setDisplayOpen] = useState(false)
  const filtersTrigger = useRef<HTMLButtonElement>(null)
  const displayTrigger = useRef<HTMLButtonElement>(null)

  return (
    <div className={styles.pagehead}>
      <div className={styles.crumbRow}>
        <SidebarToggle />
        {/* Heading for the screen; the breadcrumb below carries it visually. */}
        <h1 className={styles.pageTitle}>{labelPath[labelPath.length - 1]}</h1>
        <Breadcrumb separator="›">
          {labelPath.map((crumb, index) => (
            <BreadcrumbItem
              // Labels are not unique along the path; position is the stable key.
              key={`${index}-${crumb}`}
              current={index === labelPath.length - 1}
            >
              {crumb}
            </BreadcrumbItem>
          ))}
        </Breadcrumb>
        {onExitSearch && (
          <button
            type="button"
            className={styles.exitSearch}
            onClick={onExitSearch}
            title="Sair da busca"
            aria-label="Sair da busca"
          >
            ×
          </button>
        )}
      </div>

      <div className={styles.toolbar}>
        {pills.length > 0 && (
          <div className={styles.pills} role="group" aria-label={constants.pills}>
            {pills.map((pill) => (
              <button
                key={pill.id}
                type="button"
                className={styles.pill}
                /* `page`, not `true`: the right `aria-current` for a navigation control. */
                aria-current={pill.id === activeNodeId ? 'page' : undefined}
                onClick={() => onSelectPill(pill)}
              >
                {pill.label}
              </button>
            ))}
          </div>
        )}

        {/* Next to the pills, not the right-side buttons: what it produces is a new
                     pill — the gesture is "save what I am looking at". */}
        <button
          type="button"
          className={styles.pillAdd}
          disabled
          aria-label={constants.saveView}
          title={constants.saveViewPending}
        >
          +
        </button>

        {/* Icon buttons, not text: the prototype triaged five written controls down
                     to the funnel and the arrows. Names live in aria-label/title. */}
        <div className={styles.toolbarEnd}>
          <span className={styles.panelAnchor}>
            <button
              type="button"
              ref={filtersTrigger}
              className={styles.iconButton}
              aria-label={constants.filters}
              aria-expanded={filtersOpen}
              title={constants.filters}
              onClick={() => setFiltersOpen((current) => !current)}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M2 3.5h12L9.5 8.5v4l-3 1.5v-5.5L2 3.5Z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
              </svg>
              {/* The dot lights when a chip is applied — an icon button has no other way
                                 to say the queue is cut. */}
              {(chips.length > 0 || dateWindowDays !== null) && (
                <span className={styles.iconDot} aria-hidden="true" />
              )}
            </button>
            {/* Mounted only while open: the panel remembers which field is on
                             screen, and a closed one would reopen on the last subpanel. */}
            {filtersOpen && (
              <FilterPopover
                open={filtersOpen}
                anchor={filtersTrigger}
                onClose={() => setFiltersOpen(false)}
                base={base}
                filter={filter}
                viewerId={viewerId}
                ctx={ctx}
                onApply={onApplyFilter}
                onRemove={onRemoveFilter}
                dateWindowDays={dateWindowDays}
                onSetDateWindow={onSetDateWindow}
              />
            )}
          </span>
          <span className={styles.panelAnchor}>
            <button
              type="button"
              ref={displayTrigger}
              className={styles.iconButton}
              aria-label={constants.display}
              aria-expanded={displayOpen}
              title={constants.display}
              onClick={() => setDisplayOpen((current) => !current)}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M4.5 13V3m0 0L2.5 5.5M4.5 3l2 2.5M11.5 3v10m0 0 2-2.5M11.5 13l-2-2.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {(groupBy !== 'none' || hasCustomColumns(hiddenColumns)) && (
                <span className={styles.iconDot} aria-hidden="true" />
              )}
            </button>
            <DisplayPopover
              open={displayOpen}
              anchor={displayTrigger}
              onClose={() => setDisplayOpen(false)}
              groupBy={groupBy}
              onSetGroupBy={onSetGroupBy}
              sort={sort}
              onSort={onSort}
              availableColumns={availableColumns}
              hiddenColumns={hiddenColumns}
              onToggleColumn={onToggleColumn}
              visibleColumnKeys={visibleColumnKeys}
              onMoveColumn={onMoveColumn}
            />
          </span>
        </div>
      </div>

      {/* Chips read as sentences. Only what was added on top of the node — its own
                 filter already lights the sidebar and breadcrumb. */}
      {chips.length > 0 && (
        <div className={styles.chips}>
          {chips.map((chip) => (
            <span key={chip.field} className={styles.chip}>
              {chip.text}
              <button
                type="button"
                className={styles.chipRemove}
                aria-label={`Remover filtro ${FILTER_FIELD_COPY[chip.field]}`}
                onClick={() => onRemoveFilter(chip.field)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
