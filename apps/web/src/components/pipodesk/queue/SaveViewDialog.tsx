import { useRef, useState } from 'react'
import { Button, Modal, TextInput } from '@piposaude/design-system'
import { useDesk } from '@/components/pipodesk/shell/desk-context'
import { childGroupsOf, rootGroupOf } from '@/lib/pipodesk/permissions'
import type { TicketFilter } from '@/lib/pipodesk/filter'
import type { GroupBy } from '@/lib/pipodesk/group'
import type { TicketSort } from '@/lib/pipodesk/sort'
import constants from '@/constants/pages/pipodesk/queue'
import styles from './SaveViewDialog.module.css'

const copy = constants.saveViewDialog

export interface SaveViewDialogProps {
  scopeId: string | null
  lockScope: boolean
  filter: TicketFilter
  sort: TicketSort
  groupBy: GroupBy
  onClose: () => void
}

export function SaveViewDialog({
  scopeId,
  lockScope,
  filter,
  sort,
  groupBy,
  onClose,
}: SaveViewDialogProps) {
  const { structure, createView } = useDesk()
  const root = rootGroupOf(structure)
  const scopes = root ? [root, ...childGroupsOf(structure, root.id)] : []
  const [name, setName] = useState('')
  const [missing, setMissing] = useState(false)
  const [scope, setScope] = useState(scopeId ?? root?.id ?? '')
  const input = useRef<HTMLInputElement>(null)

  const save = () => {
    if (name.trim().length === 0) {
      setMissing(true)
      input.current?.focus()
      return
    }
    createView({ name: name.trim(), groupId: scope, filter, sort, groupBy })
    onClose()
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="sm"
      title={copy.title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button variant="primary" onClick={save}>
            {copy.save}
          </Button>
        </>
      }
    >
      <div
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          save()
        }}
      >
        <TextInput
          ref={input}
          label={copy.name}
          value={name}
          placeholder={copy.namePlaceholder}
          onChange={(event) => {
            setName(event.target.value)
            setMissing(false)
          }}
        />
      </div>
      {missing && (
        <p className={`${styles.hint} ${styles.error}`} role="alert">
          {copy.nameMissing}
        </p>
      )}
      <label className={styles.field}>
        <span>{copy.where}</span>
        <select
          value={scope}
          disabled={lockScope}
          onChange={(event) => setScope(event.target.value)}
        >
          {scopes.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </label>
      <p className={styles.hint}>{copy.whereHint}</p>
    </Modal>
  )
}
