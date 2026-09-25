import { useId } from 'react'
import { Drawer } from '@piposaude/design-system'
import {
  describeMissing,
  fieldLabel,
  type ClosingField,
  type ClosingValues,
  type MissingField,
} from '@/lib/pipodesk/closing'
import type { CompletionLife } from '@/lib/pipodesk/snapshot'
import { formatNumericDate } from '@/lib/pipodesk/format'
import constants from '@/constants/pages/pipodesk/ticket'
import styles from './ConclusionDrawer.module.css'

const copy = constants.conclusion

export interface ConclusionDrawerProps {
  open: boolean
  onClose: () => void
  fields: ClosingField[]
  values: ClosingValues
  onChange: (key: string, value: string) => void
  missing: MissingField[]
  rejected: Record<string, string>
  admissionDate: string | null
}

interface Row {
  life?: CompletionLife
  fields: ClosingField[]
}

function rowsOf(fields: ClosingField[]): Row[] {
  const rows: Row[] = []
  for (const field of fields) {
    const last = rows[rows.length - 1]
    if (last && last.life?.taxId === field.life?.taxId) last.fields.push(field)
    else rows.push({ life: field.life, fields: [field] })
  }
  return rows
}

export function ConclusionDrawer({
  open,
  onClose,
  fields,
  values,
  onChange,
  missing,
  rejected,
  admissionDate,
}: ConclusionDrawerProps) {
  const idPrefix = useId()
  const early = new Set(missing.filter((item) => item.reason === 'early').map((item) => item.key))
  const admission = admissionDate === null ? null : formatNumericDate(admissionDate)

  return (
    <Drawer
      isOpen={open}
      onClose={onClose}
      title={copy.title}
      size="lg"
      footer={
        <div className={styles.footer}>
          <span className={styles.count}>
            {missing.length === 0 ? copy.allFilled : `${describeMissing(missing)}.`}
          </span>
          <button type="button" className={styles.back} onClick={onClose}>
            {copy.back}
          </button>
        </div>
      }
    >
      <p className={styles.note}>
        {copy.note} <strong>{copy.noteAction}</strong>.
      </p>
      <div className={styles.form} role="group" aria-label={copy.group}>
        {rowsOf(fields).map((row) => (
          <div key={row.life?.taxId ?? 'ticket'} className={styles.row}>
            {row.life && (
              <span className={styles.life}>
                {row.life.name}
                <small>{copy.life(row.life.role, admission)}</small>
              </span>
            )}
            {row.fields.map((field) => {
              const id = `${idPrefix}-${field.key}`
              const refusal = rejected[field.key]
              return (
                <span key={field.key} className={styles.field}>
                  <label htmlFor={id}>{field.label}</label>
                  <input
                    id={id}
                    type={field.kind === 'date' ? 'date' : 'text'}
                    inputMode={field.kind === 'text' ? 'numeric' : undefined}
                    placeholder={field.kind === 'text' ? copy.cardPlaceholder : undefined}
                    value={values[field.key] ?? ''}
                    min={field.floor}
                    title={field.floor ? copy.floor(formatNumericDate(field.floor)) : undefined}
                    aria-label={fieldLabel(field)}
                    aria-invalid={early.has(field.key) || refusal !== undefined || undefined}
                    aria-describedby={refusal === undefined ? undefined : `${id}-refusal`}
                    onChange={(event) => onChange(field.key, event.target.value)}
                  />
                  {field.requested && (
                    <small className={styles.requested}>
                      {copy.requested(formatNumericDate(field.requested))}
                    </small>
                  )}
                  {refusal !== undefined && (
                    <small id={`${id}-refusal`} className={styles.refusal}>
                      {copy.rejected[refusal] ?? copy.rejectedOther}
                    </small>
                  )}
                </span>
              )
            })}
          </div>
        ))}
        {missing.length > 0 && <p className={styles.missing}>{`${describeMissing(missing)}.`}</p>}
      </div>
    </Drawer>
  )
}
