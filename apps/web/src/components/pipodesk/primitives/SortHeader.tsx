import styles from './SortHeader.module.css'

export type SortState = 'ascending' | 'descending' | 'none'

const GLYPH: Record<SortState, string> = {
  ascending: '↑',
  descending: '↓',
  none: '↕',
}

export interface SortHeaderProps {
  label: string
  state: SortState
  /** The mouse tooltip and, on this button, the accessible description. */
  title?: string
  onSort: () => void
}

/** The title of a column that sorts. `aria-sort` belongs on the `<th>`, not
 *  here — the dimming rules hang off the cell. */
export function SortHeader({ label, state, title, onSort }: SortHeaderProps) {
  return (
    <button type="button" className={styles.button} title={title} onClick={onSort}>
      {label}
      <span aria-hidden="true" className={styles.glyph}>
        {GLYPH[state]}
      </span>
    </button>
  )
}
