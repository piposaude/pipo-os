import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { QueueNode } from '@/lib/pipodesk/queue-view'
import {
  CATEGORY_COPY,
  defaultHits,
  hitCountLabel,
  searchQueue,
  type SearchHit,
} from '@/lib/pipodesk/search'
import type { TreeSection } from '@/lib/pipodesk/tree'
import type { TicketRow } from '@/lib/pipodesk/ticket-row'
import styles from './SearchPalette.module.css'

/** Tabbable descendants. Results are `tabIndex={-1}` on purpose: in a listbox
 *  the field keeps the focus and the arrows move the selection. */
const FOCUSABLE =
  'a[href], button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Global search palette. Selecting a result hands a synthetic node to the
 * same `select-node` as the sidebar — search has no private path to the queue.
 */
export function SearchPalette({
  open,
  onClose,
  rows,
  sections,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  rows: TicketRow[]
  sections: TreeSection[]
  onSelect: (node: QueueNode) => void
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const modal = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement>(null)
  /** Who had the focus when the palette opened — it gets it back on close. */
  const opener = useRef<HTMLElement | null>(null)

  const groups = useMemo(() => searchQueue(query, rows, sections), [query, rows, sections])
  const empty = useMemo(() => defaultHits(sections), [sections])
  const flat: SearchHit[] = query.trim() ? groups.flatMap((group) => group.hits) : empty

  /* Focus lives in an effect, not in `autoFocus`: the opener has to be read
     before the field takes the focus, and given back when the palette closes. */
  useEffect(() => {
    if (!open) return
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    field.current?.focus()
    return () => opener.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      // A modal keeps the tab ring: the sidebar and the table behind stay
      // reachable by mouse, never by keyboard while the palette is open.
      const ring = [...(modal.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
      if (ring.length === 0) return
      event.preventDefault()
      const at = ring.indexOf(document.activeElement as HTMLElement)
      const step = event.shiftKey ? -1 : 1
      ring[(at + step + ring.length) % ring.length].focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const pick = (hit: SearchHit) => {
    onSelect(hit.node)
    onClose()
  }

  const optionId = (index: number) => `search-palette-option-${index}`

  const renderHit = (hit: SearchHit, index: number) => (
    <button
      key={hit.key}
      id={optionId(index)}
      type="button"
      role="option"
      // Out of the tab order: in a listbox the field keeps the focus and the
      // arrows move the selection.
      tabIndex={-1}
      aria-selected={index === active}
      className={styles.hit}
      data-active={index === active ? 'true' : undefined}
      onMouseEnter={() => setActive(index)}
      onClick={() => pick(hit)}
    >
      <span className={styles.hitText}>
        <span className={styles.hitLabel}>{hit.label}</span>
        <span className={styles.hitDetail}>{hit.detail}</span>
      </span>
      {hit.count !== null && <span className={styles.hitCount}>{hitCountLabel(hit)}</span>}
    </button>
  )

  // In a portal, outside `.desk-root`: inside the shell, its layout rules
  // (`> div`) outrank the overlay's own and pinned the palette to the top.
  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={modal}
        role="dialog"
        aria-modal="true"
        aria-label="Busca global"
        className={styles.modal}
      >
        <input
          ref={field}
          role="combobox"
          aria-expanded="true"
          aria-controls="search-palette-results"
          // Without it the arrows move a highlight only sighted people see.
          aria-activedescendant={flat.length > 0 ? optionId(active) : undefined}
          aria-label="Buscar chamados, beneficiários, empresas e visões"
          className={styles.input}
          placeholder="Buscar…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActive((current) => Math.min(current + 1, flat.length - 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActive((current) => Math.max(current - 1, 0))
            } else if (event.key === 'Enter' && flat[active]) {
              pick(flat[active])
            }
          }}
        />
        <div
          id="search-palette-results"
          role="listbox"
          aria-label="Resultados"
          className={styles.results}
        >
          {query.trim() === '' ? (
            <>
              <p className={styles.groupLabel}>Visões da fila</p>
              {empty.map((hit, index) => renderHit(hit, index))}
            </>
          ) : groups.length === 0 ? (
            <p className={styles.nothing}>Nada encontrado.</p>
          ) : (
            groups.map((group, groupIndex) => {
              // Global index of the group's first item — previous groups consumed theirs.
              const offset = groups
                .slice(0, groupIndex)
                .reduce((sum, previous) => sum + previous.hits.length, 0)
              return (
                <div key={group.category}>
                  <p className={styles.groupLabel}>
                    {CATEGORY_COPY[group.category]}
                    {group.total > group.hits.length && (
                      <span className={styles.groupMore}> · {group.total} no total</span>
                    )}
                  </p>
                  {group.hits.map((hit, index) => renderHit(hit, offset + index))}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
