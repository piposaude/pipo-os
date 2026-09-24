import { Icon } from '@piposaude/design-system'
import type { Priority } from '@/lib/pipodesk/ticket-row'
import styles from './Queue.module.css'

const LIT_BARS: Record<Exclude<Priority, 'urgent'>, number> = { high: 3, medium: 2, low: 1 }

const BARS = [
  { x: 1.5, height: 6 },
  { x: 6, height: 9 },
  { x: 10.5, height: 12 },
]

/** Decorative: the trigger around it carries the name. Urgent is its own
 *  glyph, never a color on the bars, which "high" already fills. */
export function PriorityGlyph({ priority }: { priority: Priority | null }) {
  if (priority === 'urgent') {
    return (
      <span className={styles.priorityGlyph} data-level="urgent" aria-hidden="true">
        <Icon name="fill/alert" size="xs" />
      </span>
    )
  }

  const lit = priority === null ? 0 : LIT_BARS[priority]
  return (
    <span className={styles.priorityGlyph} data-level={priority ?? 'none'} aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        {BARS.map((bar, index) => {
          const on = index < lit
          const height = on ? bar.height : 2
          return (
            <rect
              key={bar.x}
              x={bar.x}
              y={on ? 14 - height : 7}
              width="3"
              height={height}
              rx="1"
              fill="currentColor"
              opacity={on ? 1 : 0.4}
            />
          )
        })}
      </svg>
    </span>
  )
}
