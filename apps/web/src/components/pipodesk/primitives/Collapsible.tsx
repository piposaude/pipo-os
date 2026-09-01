import type { ReactNode } from 'react'
import styles from './Collapsible.module.css'

export interface CollapsibleProps {
  open: boolean
  /** Node label — what the button announces. */
  label: ReactNode
  onToggle: () => void
  /** Content to the right (count, badge, actions). */
  trailing?: ReactNode
  children: ReactNode
}

/**
 * Expandable sidebar-tree node, controlled from outside so open state is the
 * person's preference. The DS `Navigation` is flat and `Accordion` brings card
 * chrome; the tree needs depth, count and per-row actions.
 */
export function Collapsible({ open, label, onToggle, trailing, children }: CollapsibleProps) {
  return (
    <div className={styles.node}>
      <div className={styles.row}>
        <button type="button" className={styles.trigger} aria-expanded={open} onClick={onToggle}>
          <span className={styles.chevron} aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
          {label}
        </button>
        {trailing}
      </div>
      {open ? <div className={styles.children}>{children}</div> : null}
    </div>
  )
}
