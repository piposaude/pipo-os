import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import styles from './Popover.module.css'

export interface PopoverProps {
  open: boolean
  onClose: () => void
  /** Accessible name — the popover is a `dialog` with no visible title. */
  label: string
  /** Alignment relative to the trigger. */
  align?: 'left' | 'right'
  /** Which side to open on. `top` is for the batch bar, pinned to the bottom. */
  side?: 'top' | 'bottom'
  /** The trigger. Pointer events on it belong to it: without this, closing
   *  here let its click reopen the panel and the button never closed. */
  anchor?: RefObject<HTMLElement | null>
  children: ReactNode
}

/**
 * Local popover, not the DS `PopoverMenu`: these panels hold forms (filters
 * with counts, column controls), which break `menu`/`menuitem` semantics.
 * Closes on Esc and outside click — the two gestures the DS Modal lacks
 * (PD-310).
 */
export function Popover({
  open,
  onClose,
  label,
  align = 'left',
  side = 'bottom',
  anchor,
  children,
}: PopoverProps) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    // `mousedown`, not `click`: by the time a click bubbles, the pointer may
    // have left the element it started on.
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node
      if (panel.current?.contains(target) || anchor?.current?.contains(target)) return
      onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open, onClose, anchor])

  if (!open) return null

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label={label}
      className={[
        styles.panel,
        align === 'right' ? styles.right : styles.left,
        side === 'top' ? styles.top : styles.bottom,
      ].join(' ')}
    >
      {children}
    </div>
  )
}
