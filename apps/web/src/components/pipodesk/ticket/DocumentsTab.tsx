import { useState } from 'react'
import { DeskIcon } from '@/components/pipodesk/icons'
import { ENROLLMENT_TYPE_COPY } from '@/constants/pipodesk/domain'
import {
  documentKey,
  documentLabel,
  documentTitle,
  downloadName,
  versionsByKind,
} from '@/lib/pipodesk/document'
import copy from '@/constants/pages/pipodesk/ticket/documents'
import { formatLongDate } from '@/lib/pipodesk/format'
import { displayNameOf, type RecordDocument, type TicketRecords } from '@/lib/pipodesk/record'
import type { TicketRow } from '@/lib/pipodesk/ticket-row'
import { OutageNotice } from './OutageNotice'
import { RecordEmpty, RecordNote, RecordSection } from './RecordSection'
import styles from './DocumentsTab.module.css'

export interface DocumentsTabProps {
  ticket: TicketRow
  pendingDocumentation: string[] | null
  records: TicketRecords
}

/** The note written here is session state, keyed by document id: it dies on
 *  reload like every other action on the fixture. */
function DocumentGroup({
  title,
  empty,
  documents,
  ticketId,
  person,
}: {
  title: string
  empty: string
  documents: RecordDocument[]
  ticketId: string
  person: string | null
}) {
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const groups = versionsByKind(documents)

  return (
    <RecordSection level="h2" title={title}>
      {groups.length === 0 ? (
        <RecordEmpty>{empty}</RecordEmpty>
      ) : (
        <ul className={styles.groups}>
          {groups.map(({ kind, versions }) => (
            <li key={kind}>
              <p className={styles.groupTitle}>{documentTitle({ kind }, ticketId, person)}</p>
              <ul className={styles.documents}>
                {versions.map((doc, index) => {
                  const note = notes[doc.id] ?? doc.note ?? ''
                  const as = downloadName(doc, ticketId, person)
                  return (
                    <li key={doc.id}>
                      <span className={styles.name}>
                        {doc.name}
                        {versions.length > 1 && (
                          <span className={styles.version}>
                            {index === 0 ? copy.version.current : copy.version.superseded}
                          </span>
                        )}
                      </span>
                      <span>{formatLongDate(doc.at)}</span>
                      <span>{copy.size(doc.sizeKb)}</span>
                      {/* No file behind the fixture: the control marks where
                          the action lives, off. */}
                      <button
                        type="button"
                        className={styles.download}
                        aria-label={copy.download(doc.name, as)}
                        title={copy.download(doc.name, as)}
                        disabled
                      >
                        <DeskIcon name="download" size={14} />
                      </button>
                      {editing === doc.id ? (
                        <input
                          className={styles.noteInput}
                          type="text"
                          defaultValue={note}
                          placeholder={copy.note.placeholder}
                          aria-label={copy.note.label(doc.name)}
                          autoFocus
                          onBlur={(event) => {
                            setNotes((current) => ({ ...current, [doc.id]: event.target.value }))
                            setEditing(null)
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') event.currentTarget.blur()
                            if (event.key === 'Escape') setEditing(null)
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className={note ? styles.note : styles.noteEmpty}
                          onClick={() => setEditing(doc.id)}
                        >
                          {note || copy.note.empty}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </RecordSection>
  )
}

export function DocumentsTab({ ticket, pendingDocumentation, records }: DocumentsTabProps) {
  const documents = records.documentsOf('ticket', ticket.id)
  const movedPerson = records.personById.get(records.movementOf(ticket.id)?.beneficiaryId ?? '')
  const person = movedPerson ? displayNameOf(movedPerson) : null
  const fromPipo = documents.filter((doc) => doc.origin === 'pipo')
  const fromClient = documents.filter((doc) => doc.origin === 'client')

  // What is missing comes from the ticket, not from what arrived: both facts show.
  // Matched on the normalised key, never on the label — copy must not steer it.
  const received = new Set(fromClient.map((doc) => documentKey(doc.kind)))
  // Keyed and deduplicated by the same key that decides equality: two spellings
  // of one document are one pendency, and the first one the EI wrote is the label.
  const byKey = new Map<string, string>()
  for (const spelling of pendingDocumentation ?? []) {
    const key = documentKey(spelling)
    // Everything that is not alphanumeric normalises away: `''` names no document.
    if (key !== '' && !byKey.has(key)) byKey.set(key, spelling)
  }
  const missing = [...byKey].map(([key, spelling]) => ({
    key,
    label: documentLabel(spelling),
    arrived: received.has(key),
  }))

  // Only an inclusion goes through Adobe Sign; the empty group says so instead of vanishing.
  const pipoEmpty =
    ticket.enrollmentType === 'inclusion'
      ? copy.fromPipo.empty
      : copy.fromPipo.notInclusion(
          ENROLLMENT_TYPE_COPY[ticket.enrollmentType] ?? ticket.enrollmentType,
        )

  return (
    <div className={styles.tab}>
      {records.isBackofficeDown(ticket.companyId) && <OutageNotice capturedAt={ticket.createdAt} />}

      {missing.length > 0 && (
        <RecordSection level="h2" title={copy.missing.title}>
          <ul className={styles.missing}>
            {missing.map(({ key, label, arrived }) => (
              <li key={key}>
                {label}
                {arrived && <span className={styles.arrived}> — {copy.missing.arrived}</span>}
              </li>
            ))}
          </ul>
        </RecordSection>
      )}

      <RecordSection level="h2" title={copy.mandatory.title}>
        <RecordNote>
          {copy.mandatory.unmapped(records.companyById.get(ticket.companyId)?.tradeName ?? null)}
        </RecordNote>
      </RecordSection>

      <DocumentGroup
        title={copy.fromClient.title}
        empty={copy.fromClient.empty}
        documents={fromClient}
        ticketId={ticket.id}
        person={person}
      />
      <DocumentGroup
        title={copy.fromPipo.title}
        empty={pipoEmpty}
        documents={fromPipo}
        ticketId={ticket.id}
        person={person}
      />
      {/* On screen, not in a title: a disabled button takes no focus. */}
      {documents.length > 0 && <RecordNote>{copy.downloadUnavailable}</RecordNote>}
    </div>
  )
}
