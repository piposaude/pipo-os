import { useMemo, useState, type RefObject } from 'react'
import { Popover } from '@/components/pipodesk/primitives'
import {
  DATE_WINDOWS,
  FILTER_FIELDS,
  FILTER_FIELD_COPY,
  optionLabel,
  type LabelContext,
} from '@/lib/pipodesk/filter-copy'
import {
  applyFilter,
  countByOption,
  displayOf,
  type FilterField,
  type TicketFilter,
} from '@/lib/pipodesk/filter'
import { formatCount } from '@/lib/pipodesk/format'
import type { TicketRow } from '@/lib/pipodesk/ticket-row'
import styles from './Queue.module.css'

/**
 * Filters panel. Two levels: field list, then options with per-option counts
 * over the base cut by the OTHER chips (the edited field leaves the cut, or
 * unchecked options would count zero). The opening window comes first and is
 * not a field: it lives in `dateWindowDays` and applies before the filter —
 * as a chip, its × would return the whole period.
 */
export interface FilterPopoverProps {
  /** The trigger, so its own click closes the panel. */
  anchor?: RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  /** The node's tickets, before any chip. */
  base: TicketRow[]
  filter: TicketFilter
  viewerId: string
  ctx: LabelContext
  onApply: (field: FilterField, values: string[]) => void
  /** Unchecking the last option removes the field instead of writing `[]` —
   *  an empty list reads as "no restriction" and would show the whole pod. */
  onRemove: (field: FilterField) => void
  dateWindowDays: number | null
  onSetDateWindow: (days: number | null) => void
}

export function FilterPopover({
  open,
  onClose,
  base,
  filter,
  viewerId,
  ctx,
  onApply,
  onRemove,
  dateWindowDays,
  onSetDateWindow,
  anchor,
}: FilterPopoverProps) {
  const [field, setField] = useState<FilterField | null>(null)
  const [query, setQuery] = useState('')
  const [onDateWindow, setOnDateWindow] = useState(false)

  /** Closing resets state: reopening must land on the field list, not the
   *  previous field's options. */
  const close = () => {
    setField(null)
    setQuery('')
    setOnDateWindow(false)
    onClose()
  }

  const options = useMemo(() => {
    if (field === null) return []
    const others: TicketFilter = { ...filter }
    delete others[field]
    const scoped = applyFilter(base, others, viewerId)
    const counts = countByOption(scoped, field)
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count, label: optionLabel(field, value, ctx) }))
      .filter((option) => option.label.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => b.count - a.count)
  }, [base, field, filter, query, viewerId, ctx])

  /** Stored value → the option's token: `null` becomes the FIELD's sentinel
   *  (`livre` for Dono, `sem` for Prioridade and Contrato), never a literal —
   *  the wrong one travels as a value and silently empties the cut. */
  const toToken = (target: FilterField, raw: string | null) => displayOf(target, raw)
  /** …and how it reads on screen: `'@me'` shows as the viewer. Picking
   *  yourself writes `'@me'` back — or the queue would become someone's
   *  personal queue. */
  const toDisplay = (target: FilterField, raw: string | null) =>
    raw === '@me' ? viewerId : toToken(target, raw)
  const toRaw = (display: string) => (display === viewerId ? '@me' : display)

  const rawValues = field === null ? [] : ((filter[field] as (string | null)[] | undefined) ?? [])
  const selected = field === null ? [] : rawValues.map((raw) => toDisplay(field, raw))

  const toggle = (value: string) => {
    if (field === null) return
    const next = selected.includes(value)
      ? rawValues.filter((raw) => toDisplay(field, raw) !== value).map((raw) => toToken(field, raw))
      : [...rawValues.map((raw) => toToken(field, raw)), toRaw(value)]
    // An empty list is not a filter: `matchesFilter` ignores it and the node's
    // own cut would go with it, breadcrumb still announcing it.
    if (next.length === 0) onRemove(field)
    else onApply(field, next)
  }

  return (
    <Popover open={open} onClose={close} label="Filtros" align="right" anchor={anchor}>
      <div className={styles.panelBody}>
        {onDateWindow ? (
          <>
            <div className={styles.panelHead}>
              <button
                type="button"
                className={styles.panelBack}
                onClick={() => setOnDateWindow(false)}
              >
                Voltar
              </button>
              <span>Aberto em</span>
            </div>
            {/* Single choice, not a set: windows are mutually exclusive — picking swaps
                             instead of adding. */}
            {DATE_WINDOWS.map((window) => (
              <button
                key={window.label}
                type="button"
                className={styles.panelItem}
                aria-pressed={window.days === dateWindowDays}
                onClick={() => {
                  onSetDateWindow(window.days)
                  setOnDateWindow(false)
                }}
              >
                {window.label}
              </button>
            ))}
          </>
        ) : field === null ? (
          <>
            {/* "Aberto em" first: it defines the base the other fields count over. */}
            <button
              type="button"
              className={styles.panelItem}
              onClick={() => setOnDateWindow(true)}
            >
              <span>Aberto em</span>
              <span className={styles.panelCount}>
                {DATE_WINDOWS.find((window) => window.days === dateWindowDays)?.label}
              </span>
            </button>
            {FILTER_FIELDS.map((option) => (
              <button
                key={option}
                type="button"
                className={styles.panelItem}
                onClick={() => {
                  setField(option)
                  setQuery('')
                }}
              >
                {FILTER_FIELD_COPY[option]}
              </button>
            ))}
          </>
        ) : (
          <>
            <div className={styles.panelHead}>
              <button type="button" className={styles.panelBack} onClick={() => setField(null)}>
                Voltar
              </button>
              <span>{FILTER_FIELD_COPY[field]}</span>
            </div>
            {/* `aria-label`, not a visible label — the field name is on the line above;
                             what was missing was a NAME (placeholder vanishes on typing). */}
            <input
              type="text"
              aria-label={`Filtrar ${FILTER_FIELD_COPY[field]}`}
              className={styles.panelSearch}
              placeholder="Buscar…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className={styles.panelScroll}>
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={styles.panelItem}
                  aria-pressed={selected.includes(option.value)}
                  onClick={() => toggle(option.value)}
                >
                  <span className={styles.panelLabel}>{option.label}</span>
                  <span className={styles.panelCount}>{formatCount(option.count)}</span>
                </button>
              ))}
              {options.length === 0 && <div className={styles.panelEmpty}>Nada encontrado.</div>}
            </div>
          </>
        )}
      </div>
    </Popover>
  )
}
