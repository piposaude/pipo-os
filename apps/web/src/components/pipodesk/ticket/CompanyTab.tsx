import { CarrierLogo, DescriptionItem, DescriptionList, Status } from '@piposaude/design-system'
import { COMPANY_SIZE_COPY, PRODUCT_COPY } from '@/constants/pipodesk/domain'
import copy from '@/constants/pages/pipodesk/ticket/company'
import recordCopy from '@/constants/pages/pipodesk/ticket/record'
import { carrierSlug } from '@/lib/pipodesk/carrier'
import { formatLongDate, formatLongDateWithYear } from '@/lib/pipodesk/format'
import { contractExpired, type Contract, type TicketRecords } from '@/lib/pipodesk/record'
import { CopyButton } from './CopyButton'
import { OutageNotice } from './OutageNotice'
import { Emphasis, RecordEmpty, RecordNote, RecordSection } from './RecordSection'
import { Secret } from './Secret'
import styles from './CompanyTab.module.css'

export interface CompanyTabProps {
  companyId: string
  /** The policy this ticket moves: Prêmios cuts to it. Absent, the list is whole. */
  policyId: string | undefined
  records: TicketRecords
  capturedAt: string
  /** Date-only; a contract whose term ended before it is expired. */
  today: string
}

function ContractCard({
  contract,
  records,
  today,
}: {
  contract: Contract
  records: TicketRecords
  today: string
}) {
  const carrier = records.carrierById.get(contract.carrierId)
  const carrierName = carrier?.name ?? contract.carrierId
  const expired = contractExpired(contract.endDate, today)
  const attached = records.documentsOf('contract', contract.id).length
  const { access } = contract

  return (
    <li className={styles.contract}>
      {/* The carrier is the title: it is what tells two contracts of the same
          company apart, and the product repeats the Benefício line below. */}
      <div className={styles.contractHead}>
        <CarrierLogo carrier={carrierSlug(carrierName)} size="md" />
        <strong>{carrierName}</strong>
        <Status variant={expired ? 'alert' : 'success'}>
          {expired ? copy.contract.expired : copy.contract.active}
        </Status>
      </div>
      <p className={styles.line}>
        {copy.contract.benefit} {PRODUCT_COPY[contract.product] ?? contract.product}
      </p>
      <p className={styles.line}>
        {copy.contract.number} <span className={styles.number}>{contract.number}</span>
        <CopyButton value={contract.number} label={copy.contract.copyNumber(contract.number)} />
      </p>
      <p className={styles.muted}>
        {formatLongDateWithYear(contract.startDate)} — {formatLongDateWithYear(contract.endDate)}
      </p>
      {expired && <p className={styles.warn}>{copy.contract.expiredWarning}</p>}
      <p className={styles.muted}>
        {copy.contract.files(attached)}
        {contract.hasPendingFile && (
          <span className={styles.warn}>{copy.contract.pendingFile}</span>
        )}
      </p>
      <div className={styles.vault}>
        {access ? (
          <>
            <p className={styles.line}>
              {copy.contract.portal} <span className={styles.value}>{carrier?.portal ?? '—'}</span>
              {carrier?.portal && (
                <CopyButton value={carrier.portal} label={copy.contract.copyPortal} />
              )}
            </p>
            <p className={styles.line}>
              {copy.contract.login} <span className={styles.value}>{access.login}</span>
              <CopyButton value={access.login} label={copy.contract.copyLogin} />
            </p>
            <p className={styles.line}>
              {copy.contract.password}{' '}
              <Secret value={access.password} label={copy.contract.passwordLabel} />
              <CopyButton value={access.password} label={copy.contract.copyPassword} />
            </p>
            <p className={styles.muted}>
              {copy.contract.passwordUpdated(formatLongDateWithYear(access.updatedAt))}
            </p>
          </>
        ) : (
          <p className={styles.warn}>{copy.contract.noAccess}</p>
        )}
      </div>
    </li>
  )
}

export function CompanyTab({ companyId, policyId, records, capturedAt, today }: CompanyTabProps) {
  const company = records.companyById.get(companyId)
  if (!company) return <RecordEmpty>{recordCopy.notFound.company}</RecordEmpty>

  const parent = company.parentId ? records.companyById.get(company.parentId) : undefined
  const companyContracts = records.contractsOf(company.id)
  const companyPlans = records.policiesOf(company.id)
  // Only the moved policy; the whole list is the fallback for a policy of another
  // company (a branch on the parent's), and the section says so instead of hiding it.
  const currentPlan = companyPlans.find((plan) => plan.id === policyId)
  const plans = currentPlan ? [currentPlan] : companyPlans
  /* The contract is company × carrier × product, and the policy already names
     the three — the whole list is the same fallback as `plans`. */
  const contracts = currentPlan
    ? companyContracts.filter(
        (contract) =>
          contract.carrierId === currentPlan.carrierId && contract.product === currentPlan.product,
      )
    : companyContracts
  const plansNotCut = policyId !== undefined && currentPlan === undefined && plans.length > 0
  const files = records.documentsOf('company', company.id)

  return (
    <div className={styles.tab}>
      {records.isBackofficeDown(company.id) && <OutageNotice capturedAt={capturedAt} />}

      <RecordSection level="h2" title={copy.sections.data}>
        <DescriptionList>
          <DescriptionItem label={copy.fields.legalName}>{company.legalName}</DescriptionItem>
          <DescriptionItem label={copy.fields.tradeName}>{company.tradeName}</DescriptionItem>
          <DescriptionItem label={copy.fields.cnpj}>{company.cnpj}</DescriptionItem>
          <DescriptionItem label={copy.fields.porte}>
            {COMPANY_SIZE_COPY[company.porte] ?? company.porte}
          </DescriptionItem>
          <DescriptionItem label={copy.fields.structure}>
            {parent ? copy.structure.branchOf(parent.tradeName) : copy.structure.parent}
          </DescriptionItem>
        </DescriptionList>
        {company.contractualSla && (
          <RecordNote>
            <Emphasis
              text={copy.slaNote(company.contractualSla.hours, company.contractualSla.hasPenalty)}
            />
          </RecordNote>
        )}
      </RecordSection>

      <RecordSection
        level="h2"
        title={currentPlan ? copy.sections.ticketContract : copy.sections.contracts}
      >
        {contracts.length === 0 ? (
          <RecordEmpty>{copy.contract.empty}</RecordEmpty>
        ) : (
          <ul className={styles.list}>
            {contracts.map((contract) => (
              <ContractCard key={contract.id} contract={contract} records={records} today={today} />
            ))}
          </ul>
        )}
        <RecordNote>
          <Emphasis text={copy.contract.note} />
          {parent && (
            <Emphasis text={copy.contract.branchNote(parent.tradeName, contracts.length === 1)} />
          )}
        </RecordNote>
      </RecordSection>

      <RecordSection level="h2" title={copy.sections.plans}>
        {plans.length === 0 ? (
          <RecordEmpty>{copy.plans.empty}</RecordEmpty>
        ) : (
          <ul className={styles.list}>
            {plans.map((plan) => (
              <li key={plan.id} className={styles.row}>
                <span>{plan.name}</span>
                <span className={styles.code}>{plan.code}</span>
                <span>{PRODUCT_COPY[plan.product] ?? plan.product}</span>
              </li>
            ))}
          </ul>
        )}
        {plansNotCut && <RecordNote>{copy.plans.otherCompany}</RecordNote>}
      </RecordSection>

      <RecordSection level="h2" title={copy.sections.files}>
        {files.length === 0 ? (
          <RecordEmpty>{copy.files.empty}</RecordEmpty>
        ) : (
          <ul className={styles.list}>
            {files.map((file) => (
              <li key={file.id} className={styles.row}>
                <span>{file.name}</span>
                <span>{formatLongDate(file.at)}</span>
                <span>{copy.files.size(file.sizeKb)}</span>
              </li>
            ))}
          </ul>
        )}
        <RecordNote>{copy.files.note}</RecordNote>
      </RecordSection>
    </div>
  )
}
