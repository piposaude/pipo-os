import { useEffect, useMemo, useState } from 'react'
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

  const groups = useMemo(() => searchQueue(query, rows, sections), [query, rows, sections])
  const empty = useMemo(() => defaultHits(sections), [sections])
  const flat: SearchHit[] = query.trim() ? groups.flatMap((group) => group.hits) : empty

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
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
      <div role="dialog" aria-label="Busca global" className={styles.modal}>
        {/* `autoFocus`, not an effect: the modal mounts on open, so focusing the
                     field is mount behavior — open and type. */}
        <input
          autoFocus
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
