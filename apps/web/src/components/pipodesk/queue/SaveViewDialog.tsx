import { useEffect, useRef, useState } from 'react'
import { Button, Modal, TextInput } from '@piposaude/design-system'
import { useDesk, type NewView } from '@/components/pipodesk/shell/desk-context'
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
  onSave: (view: NewView) => Promise<boolean>
  onClose: () => void
}

export function SaveViewDialog({
  scopeId,
  lockScope,
  filter,
  sort,
  groupBy,
  onSave,
  onClose,
}: SaveViewDialogProps) {
  const { structure } = useDesk()
  const root = rootGroupOf(structure)
  const scopes = root ? [root, ...childGroupsOf(structure, root.id)] : []
  const [name, setName] = useState('')
  const [missing, setMissing] = useState(false)
  const [refused, setRefused] = useState(false)
  const saving = useRef(false)
  const [scope, setScope] = useState(scopeId ?? root?.id ?? '')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
  }, [])

  const save = async () => {
    if (name.trim().length === 0) {
      setMissing(true)
      input.current?.focus()
      return
    }
    if (saving.current) return
    saving.current = true
    const saved = await onSave({ name: name.trim(), groupId: scope, filter, sort, groupBy })
    saving.current = false
    if (saved) onClose()
    else setRefused(true)
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
          <Button variant="primary" onClick={() => void save()}>
            {copy.save}
          </Button>
        </>
      }
    >
      <div
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          void save()
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
            setRefused(false)
          }}
        />
      </div>
      {missing && (
        <p className={`${styles.hint} ${styles.error}`} role="alert">
          {copy.nameMissing}
        </p>
      )}
      {refused && (
        <p className={`${styles.hint} ${styles.error}`} role="alert">
          {copy.refused}
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
