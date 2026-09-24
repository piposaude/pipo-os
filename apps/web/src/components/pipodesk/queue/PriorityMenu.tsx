import { useRef, useState } from 'react'
import { Popover } from '@/components/pipodesk/primitives'
import { PRIORITY_COPY } from '@/constants/pipodesk/domain'
import { PRIORITIES, type Priority } from '@/lib/pipodesk/ticket-row'
import constants from '@/constants/pages/pipodesk/queue'
import { PriorityGlyph } from './PriorityGlyph'
import styles from './Queue.module.css'

export interface PriorityMenuProps {
  value: Priority | null
  ticketNumber: string
  onChange: (priority: Priority | null) => void
}

export function PriorityMenu({ value, ticketNumber, onChange }: PriorityMenuProps) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)

  const pick = (priority: Priority | null) => {
    onChange(priority)
    setOpen(false)
  }

  return (
    <span className={styles.priorityAnchor} onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        ref={trigger}
        className={styles.priorityTrigger}
        data-set={value !== null ? 'true' : undefined}
        aria-label={
          value === null
            ? constants.priority.set(ticketNumber)
            : constants.priority.change(PRIORITY_COPY[value], ticketNumber)
        }
        title={value === null ? constants.priority.none : PRIORITY_COPY[value]}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <PriorityGlyph priority={value} />
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchor={trigger}
        label={constants.priority.label}
      >
        <div className={styles.panelBody}>
          {[null, ...PRIORITIES].map((level) => (
            <button
              key={level ?? 'none'}
              type="button"
              className={`${styles.panelItem} ${styles.priorityItem}`}
              disabled={level === value}
              onClick={() => pick(level)}
            >
              <PriorityGlyph priority={level} />
              {level === null ? constants.priority.none : PRIORITY_COPY[level]}
            </button>
          ))}
        </div>
      </Popover>
    </span>
  )
}
