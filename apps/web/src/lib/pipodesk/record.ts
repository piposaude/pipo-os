/** The full picture of a movement, as the record tabs read it. The tabs only
 *  know these types — never the fixture or the API snapshot shape. */

import { daysBetween, type ContractualSla } from './format'
import type { TicketRow } from './ticket-row'

export interface Address {
  zip: string
  street: string
  district: string
  number: string
  complement: string | null
  uf: string
  city: string
}

export interface BankAccount {
  holderName: string
  holderCpf: string
  bank: string
  agency: string
  account: string
}

/** Shared by the holder and their dependents: eligibility comes from the
 *  holder's job, so a dependent has no employment of their own. */
export interface EmploymentLink {
  companyId: string
  contractType: string | null
  admissionDate: string | null
  salaryCents: number | null
  registration: string | null
  jobTitle: string | null
  costCenter: string | null
}

export interface CarrierCard {
  id: string
  carrierId: string
  product: string
  number: string
  validFrom: string | null
}

export type MaritalStatus = 'single' | 'married' | 'divorced' | 'widowed' | 'domestic-partnership'

export interface Person {
  id: string
  name: string
  socialName: string | null
  cpf: string
  birthDate: string | null
  sex: 'f' | 'm' | null
  email: string | null
  phone: string | null
  maritalStatus: MaritalStatus | null
  weightKg: number | null
  heightCm: number | null
  motherName: string | null
  address: Address | null
  bankAccount: BankAccount | null
  role: 'holder' | 'dependent'
  holderId: string | null
  link: EmploymentLink | null
  cards: CarrierCard[]
}

export interface Company {
  id: string
  tradeName: string
  legalName: string | null
  cnpj: string | null
  parentId: string | null
  porte: string | null
  contractualSla: ContractualSla | null
}

export interface Carrier {
  id: string
  name: string
  /** The carrier's portal for the contract vault; `null` when unknown. */
  portal: string | null
}

export interface Policy {
  id: string
  companyId: string
  carrierId: string
  product: string
  name: string | null
  code: string | null
}

export interface PortalAccess {
  login: string
  password: string
  updatedAt: string
}

export interface Contract {
  id: string
  number: string
  companyId: string
  carrierId: string
  product: string
  /** A day or an instant; every reader goes through the day helpers. */
  startDate: string | null
  endDate: string | null
  hasPendingFile: boolean
  access: PortalAccess | null
}

export type DocumentScope = 'ticket' | 'company' | 'contract'

export interface RecordDocument {
  id: string
  name: string
  scope: DocumentScope
  scopeId: string
  origin: 'pipo' | 'client'
  kind: string
  at: string
  sizeKb: number | null
  /** The note is the file's, not the ticket's: the same document comes back in
   *  several versions, and the reason for a resend belongs to one of them. */
  note: string | null
}

/** What a ticket moves: whom, with which dependents, on which policy. */
export interface Movement {
  id: string
  beneficiaryId: string
  dependentIds: string[]
  policyId: string
  pendingDocumentation: string[] | null
}

export interface RecordSource {
  companies: Company[]
  carriers: Carrier[]
  policies: Policy[]
  contracts: Contract[]
  documents: RecordDocument[]
  beneficiaries: Person[]
  tickets: Movement[]
  boOutageCompanyIds: string[]
}

export interface TicketRecords {
  personById: ReadonlyMap<string, Person>
  companyById: ReadonlyMap<string, Company>
  carrierById: ReadonlyMap<string, Carrier>
  policyById: ReadonlyMap<string, Policy>
  dependentsOf(holderId: string): Person[]
  branchesOf(companyId: string): Company[]
  policiesOf(companyId: string): Policy[]
  contractsOf(companyId: string): Contract[]
  documentsOf(scope: DocumentScope, scopeId: string): RecordDocument[]
  movementOf(ticketId: string): Movement | undefined
  ticketIdsOf(beneficiaryId: string): string[]
  isBackofficeDown(companyId: string): boolean
}

function groupBy<T>(items: T[], keyOf: (item: T) => string | null): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    if (key === null) continue
    const list = groups.get(key) ?? []
    list.push(item)
    groups.set(key, list)
  }
  return groups
}

/** Indexed once at module scope by the fixture; the tabs only look up. */
export function indexRecords(source: RecordSource): TicketRecords {
  const dependents = groupBy(source.beneficiaries, (p) =>
    p.role === 'dependent' ? p.holderId : null,
  )
  const branches = groupBy(source.companies, (c) => c.parentId)
  const policies = groupBy(source.policies, (p) => p.companyId)
  const contracts = groupBy(source.contracts, (c) => c.companyId)
  const documents = groupBy(source.documents, (d) => `${d.scope}:${d.scopeId}`)
  const movements = new Map(source.tickets.map((t) => [t.id, t]))
  const ticketIds = groupBy(source.tickets, (t) => t.beneficiaryId)
  const outage = new Set(source.boOutageCompanyIds)

  return {
    personById: new Map(source.beneficiaries.map((p) => [p.id, p])),
    companyById: new Map(source.companies.map((c) => [c.id, c])),
    carrierById: new Map(source.carriers.map((c) => [c.id, c])),
    policyById: new Map(source.policies.map((p) => [p.id, p])),
    dependentsOf: (holderId) => dependents.get(holderId) ?? [],
    branchesOf: (companyId) => branches.get(companyId) ?? [],
    policiesOf: (companyId) => policies.get(companyId) ?? [],
    contractsOf: (companyId) => contracts.get(companyId) ?? [],
    documentsOf: (scope, scopeId) => documents.get(`${scope}:${scopeId}`) ?? [],
    movementOf: (ticketId) => movements.get(ticketId),
    ticketIdsOf: (beneficiaryId) => (ticketIds.get(beneficiaryId) ?? []).map((t) => t.id),
    isBackofficeDown: (companyId) => outage.has(companyId),
  }
}

export const displayNameOf = (person: Pick<Person, 'name' | 'socialName'>): string =>
  person.socialName ?? person.name

/** Derived from the term, never stored. By day, not by string: an instant
 *  would sort after its own day. Unreadable is not expired. */
export function contractExpired(endDate: string | null, today: string): boolean {
  if (endDate === null) return false
  const days = daysBetween(endDate, today)
  return days !== null && days > 0
}

export function historyOf(rows: TicketRow[], ticket: TicketRow): TicketRow[] {
  const others =
    ticket.taxId === null
      ? []
      : rows.filter((row) => row.taxId === ticket.taxId && row.id !== ticket.id)
  return [...others, ticket].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
