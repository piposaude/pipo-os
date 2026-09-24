import { useEffect, useRef, useState } from 'react'
import constants from '@/constants/pipodesk/sidebar'
import styles from './QueueSidebar.module.css'

export interface InlineRenameProps {
  value: string
  onCommit: (name: string) => void
  onCancel: () => void
}

export function InlineRename({ value, onCommit, onCancel }: InlineRenameProps) {
  const [draft, setDraft] = useState(value)
  const field = useRef<HTMLInputElement>(null)
  /** Enter commits and the unmount blurs: without the latch the name is sent twice. */
  const done = useRef(false)

  useEffect(() => {
    field.current?.select()
  }, [])

  const commit = () => {
    if (done.current) return
    done.current = true
    if (draft.trim().length === 0) onCancel()
    else onCommit(draft.trim())
  }

  const cancel = () => {
    if (done.current) return
    done.current = true
    onCancel()
  }

  return (
    <input
      ref={field}
      type="text"
      aria-label={constants.rowMenu.renameField(value)}
      className={styles.rename}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') {
          event.preventDefault()
          commit()
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          cancel()
        }
      }}
    />
  )
}
