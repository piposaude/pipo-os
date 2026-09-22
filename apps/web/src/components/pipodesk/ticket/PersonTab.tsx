import { useEffect, useRef } from 'react'
import {
  Status,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@piposaude/design-system'
import { MARITAL_STATUS_COPY, PRODUCT_COPY, SEX_COPY } from '@/constants/pipodesk/domain'
import copy from '@/constants/pages/pipodesk/ticket/person'
import recordCopy from '@/constants/pages/pipodesk/ticket/record'
import {
  RECORD_EMPTY,
  formatCpf,
  formatHeight,
  formatLongDateWithYear,
  formatNumericDate,
  formatSalary,
  formatWeight,
  formatZip,
} from '@/lib/pipodesk/format'
import { displayNameOf, type Person, type TicketRecords } from '@/lib/pipodesk/record'
import { clickedControl } from '@/lib/pipodesk/row-click'
import { OutageNotice } from './OutageNotice'
import detail from './DetailTable.module.css'
import {
  Emphasis,
  RecordBlock,
  RecordEmpty,
  RecordField,
  RecordFields,
  RecordNote,
  RecordSection,
} from './RecordSection'
import styles from './PersonTab.module.css'

export interface PersonTabProps {
  /** Who is on screen — the page decides; the tab only asks to switch. */
  personId: string
  records: TicketRecords
  capturedAt: string
  onSelectPerson: (personId: string) => void
}

const or = (value: string | null | undefined): string => value || RECORD_EMPTY

const productsOf = (person: Person): string =>
  person.cards.map((card) => PRODUCT_COPY[card.product] ?? card.product).join(', ')

export function PersonTab({ personId, records, capturedAt, onSelectPerson }: PersonTabProps) {
  // The button that switched the person unmounts with the switch, dropping focus to
  // the body; the name it navigated to takes it, as the Popover does with its trigger.
  const nameRef = useRef<HTMLHeadingElement>(null)
  // The id asked for, not a flag: a parent that switches to someone else than the
  // person asked for does not move the focus. Both call sites ask for another person.
  const switchedTo = useRef<string | null>(null)
  useEffect(() => {
    if (switchedTo.current !== personId) return
    switchedTo.current = null
    nameRef.current?.focus()
  }, [personId])

  const person = records.personById.get(personId)
  if (!person) return <RecordEmpty>{recordCopy.notFound.person}</RecordEmpty>

  const selectPerson = (id: string) => {
    switchedTo.current = id
    onSelectPerson(id)
  }

  const isDependent = person.role === 'dependent'
  const holder = person.holderId ? records.personById.get(person.holderId) : undefined
  const dependents = records.dependentsOf(person.id)
  // The section is the holder's job whoever is on screen; never trust the copy on a
  // dependent. Without the holder in the record there is no holder job to show.
  const holderLink = isDependent ? (holder?.link ?? null) : person.link
  const company = holderLink ? records.companyById.get(holderLink.companyId) : undefined
  // A dependent usually has no account: the refund lands on the holder's, and the
  // tab says so — but only when the account really is the holder's, not by role.
  const account = person.bankAccount ?? holder?.bankAccount ?? null
  const accountIsHolders = person.bankAccount === null && account !== null

  return (
    <div className={styles.tab}>
      {/* The holder's company when it is known; without it, the only one on record. */}
      {records.isBackofficeDown((holderLink ?? person.link).companyId) && (
        <OutageNotice capturedAt={capturedAt} />
      )}

      <RecordBlock>
        <div className={styles.head}>
          <h2 className={styles.name} ref={nameRef} tabIndex={-1}>
            {displayNameOf(person)}
          </h2>
          <Status variant="neutral">{isDependent ? copy.role.dependent : copy.role.holder}</Status>
        </div>
        {isDependent && holder && (
          <p className={styles.holderLink}>
            {copy.dependentOf}{' '}
            <button
              type="button"
              className={styles.personButton}
              onClick={() => selectPerson(holder.id)}
            >
              {displayNameOf(holder)}
            </button>
          </p>
        )}
        {isDependent && (
          <RecordNote>
            <Emphasis text={copy.dependentContact} />
          </RecordNote>
        )}
      </RecordBlock>

      <RecordSection title={copy.sections.personal}>
        <RecordFields>
          <RecordField label={copy.fields.id}>{person.id}</RecordField>
          {person.socialName && (
            <RecordField label={copy.fields.socialName}>{person.socialName}</RecordField>
          )}
          <RecordField label={copy.fields.name}>{person.name}</RecordField>
          {/* The admission below stays long on purpose: only the birth date
              takes the short form. */}
          <RecordField label={copy.fields.birthDate}>
            {formatNumericDate(person.birthDate)}
          </RecordField>
          <RecordField label={copy.fields.cpf}>{formatCpf(person.cpf)}</RecordField>
          {/* The `??` looks dead against the union, but the fixture enters by cast:
              a JSON not regenerated can still carry a value the union dropped. */}
          <RecordField label={copy.fields.sex}>{SEX_COPY[person.sex] ?? person.sex}</RecordField>
          <RecordField label={copy.fields.maritalStatus}>
            {MARITAL_STATUS_COPY[person.maritalStatus] ?? person.maritalStatus}
          </RecordField>
          <RecordField label={copy.fields.weight}>{formatWeight(person.weightKg)}</RecordField>
          <RecordField label={copy.fields.height}>{formatHeight(person.heightCm)}</RecordField>
          <RecordField label={copy.fields.motherName}>{person.motherName}</RecordField>
        </RecordFields>
        {person.socialName && (
          <RecordNote>
            <Emphasis text={copy.socialNameNote} />
          </RecordNote>
        )}
      </RecordSection>

      <RecordSection title={copy.sections.holder}>
        {holderLink === null ? (
          <RecordEmpty>{copy.holderMissing}</RecordEmpty>
        ) : (
          <RecordFields>
            <RecordField label={copy.fields.company}>{or(company?.tradeName)}</RecordField>
            <RecordField label={copy.fields.cnpj}>{or(company?.cnpj)}</RecordField>
            <RecordField label={copy.fields.admissionDate}>
              {formatLongDateWithYear(holderLink.admissionDate)}
            </RecordField>
            <RecordField label={copy.fields.contractType}>
              {holderLink.contractType.toUpperCase()}
            </RecordField>
            <RecordField label={copy.fields.salary}>
              {formatSalary(holderLink.salaryCents)}
            </RecordField>
            <RecordField label={copy.fields.registration}>{holderLink.registration}</RecordField>
            <RecordField label={copy.fields.jobTitle}>{or(holderLink.jobTitle)}</RecordField>
            <RecordField label={copy.fields.costCenter}>{or(holderLink.costCenter)}</RecordField>
          </RecordFields>
        )}
      </RecordSection>

      <RecordSection title={copy.sections.contact}>
        <RecordFields>
          {/* The record fabricates a contact for dependents; it is nobody's. */}
          {!isDependent && <RecordField label={copy.fields.email}>{person.email}</RecordField>}
          {!isDependent && <RecordField label={copy.fields.phone}>{person.phone}</RecordField>}
          <RecordField label={copy.fields.zip}>{formatZip(person.address.zip)}</RecordField>
          <RecordField label={copy.fields.street}>{person.address.street}</RecordField>
          <RecordField label={copy.fields.district}>{person.address.district}</RecordField>
          <RecordField label={copy.fields.number}>{person.address.number}</RecordField>
          <RecordField label={copy.fields.complement}>{or(person.address.complement)}</RecordField>
          <RecordField label={copy.fields.uf}>{person.address.uf}</RecordField>
          <RecordField label={copy.fields.city}>{person.address.city}</RecordField>
        </RecordFields>
      </RecordSection>

      <RecordSection
        title={copy.sections.refund}
        badge={
          accountIsHolders ? (
            <Status variant="neutral">{copy.refund.holderBadge}</Status>
          ) : undefined
        }
      >
        {account === null ? (
          <RecordEmpty>{copy.refund.empty}</RecordEmpty>
        ) : (
          <RecordFields>
            <RecordField label={copy.refund.fields.holderName}>{account.holderName}</RecordField>
            <RecordField label={copy.refund.fields.holderCpf}>
              {formatCpf(account.holderCpf)}
            </RecordField>
            <RecordField label={copy.refund.fields.bank}>{account.bank}</RecordField>
            <RecordField label={copy.refund.fields.agency}>{account.agency}</RecordField>
            <RecordField label={copy.refund.fields.account}>{account.account}</RecordField>
          </RecordFields>
        )}
        {accountIsHolders && (
          <RecordNote>
            <Emphasis text={copy.refund.dependentNote} />
          </RecordNote>
        )}
      </RecordSection>

      {dependents.length > 0 && (
        <RecordSection title={copy.sections.dependents}>
          <Table className={`${detail.table} ${styles.dependents}`}>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{copy.dependents.columns.name}</TableHeaderCell>
                <TableHeaderCell>{copy.dependents.columns.relationship}</TableHeaderCell>
                <TableHeaderCell>{copy.dependents.columns.birthDate}</TableHeaderCell>
                <TableHeaderCell>{copy.dependents.columns.cpf}</TableHeaderCell>
                <TableHeaderCell>{copy.dependents.columns.benefits}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {dependents.map((dependent) => (
                <TableRow
                  key={dependent.id}
                  data-row-target={dependent.id}
                  onClick={(event) => {
                    if (clickedControl(event)) return
                    selectPerson(dependent.id)
                  }}
                >
                  <TableCell>
                    <button
                      type="button"
                      className={styles.dependentButton}
                      onClick={() => selectPerson(dependent.id)}
                    >
                      {displayNameOf(dependent)}
                    </button>
                  </TableCell>
                  <TableCell>{copy.role.dependent}</TableCell>
                  <TableCell className={styles.numeric}>
                    {formatNumericDate(dependent.birthDate)}
                  </TableCell>
                  <TableCell className={styles.numeric}>{formatCpf(dependent.cpf)}</TableCell>
                  <TableCell>{productsOf(dependent) || copy.dependents.noBenefit}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <RecordNote>
            <Emphasis text={copy.dependents.note} />
          </RecordNote>
        </RecordSection>
      )}

      <RecordSection title={copy.sections.cards}>
        {person.cards.length === 0 ? (
          <RecordEmpty>{copy.cards.empty}</RecordEmpty>
        ) : (
          <Table className={detail.table}>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{copy.cards.carrier}</TableHeaderCell>
                <TableHeaderCell>{copy.cards.benefit}</TableHeaderCell>
                <TableHeaderCell>{copy.cards.number}</TableHeaderCell>
                <TableHeaderCell>{copy.cards.since}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {person.cards.map((card) => (
                <TableRow key={card.id}>
                  <TableCell>
                    {records.carrierById.get(card.carrierId)?.name ?? card.carrierId}
                  </TableCell>
                  <TableCell>{PRODUCT_COPY[card.product] ?? card.product}</TableCell>
                  <TableCell className={styles.cardNumber}>{card.number}</TableCell>
                  <TableCell>{formatNumericDate(card.validFrom)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </RecordSection>
    </div>
  )
}
