import type { RefObject } from 'react'
import { Popover } from '@/components/pipodesk/primitives'
import { DIRECTION_COPY, GROUP_BY_COPY, SORT_COPY } from '@/lib/pipodesk/filter-copy'
import { FIXED_COLUMN } from '@/lib/pipodesk/columns'
import type { GroupBy } from '@/lib/pipodesk/group'
import type { SortField, TicketSort } from '@/lib/pipodesk/sort'
import styles from './Queue.module.css'

/**
 * Display panel: group by, sort and columns. Each section is a named
 * `role="group"` — three labels repeat across sections, and without the group
 * neither screen readers nor test selectors can tell which is which. Sorting
 * exists outside the table header for the first time here: the Prazo column
 * is hidable, and hiding it used to remove the criterion.
 */
export interface DisplayPopoverProps {
  /** The trigger, so its own click closes the panel. */
  anchor?: RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
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

export function DisplayPopover({
  open,
  onClose,
  groupBy,
  onSetGroupBy,
  sort,
  onSort,
  availableColumns,
  hiddenColumns,
  onToggleColumn,
  visibleColumnKeys,
  onMoveColumn,
  anchor,
}: DisplayPopoverProps) {
  return (
    <Popover open={open} onClose={onClose} label="Exibição" align="right" anchor={anchor}>
      <div className={styles.panelBody}>
        <div role="group" aria-label="Agrupar por">
          <p className={styles.panelSection}>Agrupar por</p>
          {(Object.keys(GROUP_BY_COPY) as GroupBy[]).map((option) => (
            <button
              key={option}
              type="button"
              className={styles.panelItem}
              aria-pressed={groupBy === option}
              onClick={() => onSetGroupBy(option)}
            >
              {GROUP_BY_COPY[option]}
            </button>
          ))}
        </div>

        <div role="group" aria-label="Ordenar por">
          <p className={styles.panelSection}>Ordenar por</p>
          {(Object.keys(SORT_COPY) as SortField[]).map((by) => {
            const ativo = sort.by === by
            return (
              <button
                key={by}
                type="button"
                className={styles.panelItem}
                aria-pressed={ativo}
                /* Clicking the active criterion flips direction — same gesture as the
                                   table header. */
                onClick={() =>
                  onSort({ by, direction: ativo && sort.direction === 'asc' ? 'desc' : 'asc' })
                }
              >
                <span>{SORT_COPY[by]}</span>
                {ativo && (
                  <span className={styles.panelCount}>{DIRECTION_COPY[sort.direction]}</span>
                )}
              </button>
            )
          })}
        </div>

        <div role="group" aria-label="Colunas">
          <p className={styles.panelSection}>Colunas</p>
          <div className={styles.panelScroll}>
            {availableColumns.map((column) => {
              const visivel = !hiddenColumns.includes(column.key)
              // Without dropping the fixed column, every data column reads one
              // position to the right and the first one offered a dead arrow.
              const ordenaveis = visibleColumnKeys.filter((key) => key !== FIXED_COLUMN)
              const posicao = ordenaveis.indexOf(column.key)
              return (
                <div key={column.key} className={styles.columnRow}>
                  <button
                    type="button"
                    className={styles.panelItem}
                    aria-pressed={visivel}
                    onClick={() => onToggleColumn(column.key)}
                  >
                    {column.label}
                  </button>
                  {/* Disabled at the edges and on hidden columns — moving what you cannot
                                         see is a promise the screen cannot keep. */}
                  <button
                    type="button"
                    className={styles.columnMove}
                    aria-label={`Mover ${column.label} para a esquerda`}
                    disabled={!visivel || posicao <= 0}
                    onClick={() => onMoveColumn(column.key, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={styles.columnMove}
                    aria-label={`Mover ${column.label} para a direita`}
                    disabled={!visivel || posicao === ordenaveis.length - 1}
                    onClick={() => onMoveColumn(column.key, 1)}
                  >
                    ↓
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Popover>
  )
}
