/**
 * The ONLY module that knows the `enrollmentSnapshot` shape (decision D4) —
 * a snapshot contract change (RFC PD-001) costs one file, not the whole desk.
 */

import type { Ticket } from '@pipo-os/api-client'
import {
  indexRecords,
  type Address,
  type BankAccount,
  type Company,
  type Contract,
  type EmploymentLink,
  type MaritalStatus,
  type Movement,
  type Person,
  type Policy,
  type RecordDocument,
  type TicketRecords,
} from './record'

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** `member-type` (how EI serializes today) and `memberType` are the same key. */
const camelOf = (key: string): string =>
  key.replace(/[-_]([a-z])/g, (_, letter: string) => letter.toUpperCase())

const snakeOf = (key: string): string => key.replace(/[-]/g, '_')

/**
 * Reads a snapshot path accepting kebab/snake/camelCase per segment. The
 * contract is not frozen yet (RFC PD-001); a hyphen must not blank the queue.
 */
function readPath(source: unknown, path: string[]): unknown {
  let current: unknown = source
  for (const segment of path) {
    if (!isRecord(current)) return undefined
    const record = current
    const key = [segment, camelOf(segment), snakeOf(segment)].find((candidate) =>
      Object.prototype.hasOwnProperty.call(record, candidate),
    )
    if (key === undefined) return undefined
    current = record[key]
  }
  return current
}

function readString(source: unknown, ...paths: string[][]): string | null {
  for (const path of paths) {
    const value = readPath(source, path)
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return null
}

export interface SnapshotHeadline {
  beneficiaryName: string | null
  taxId: string | null
  companyName: string | null
}

export function snapshotHeadline(snapshot: unknown): SnapshotHeadline {
  return {
    beneficiaryName: readString(
      snapshot,
      ['primary', 'profile', 'preferred-name'],
      ['primary', 'profile', 'name'],
    ),
    taxId: readString(snapshot, ['primary', 'profile', 'tax-id']),
    companyName: readString(snapshot, ['company', 'company-name'], ['company', 'name']),
  }
}

function readNumber(source: unknown, path: string[]): number | null {
  const value = readPath(source, path)
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readList(source: unknown, path: string[]): unknown[] {
  const value = readPath(source, path)
  return Array.isArray(value) ? value : []
}

const SEX_OF: Record<string, Person['sex']> = { female: 'f', male: 'm' }

const MARITAL_STATUSES: readonly MaritalStatus[] = [
  'single',
  'married',
  'divorced',
  'widowed',
  'domestic-partnership',
]

function maritalStatusOf(value: string | null): MaritalStatus | null {
  return MARITAL_STATUSES.find((status) => status === value?.toLowerCase()) ?? null
}

function addressOf(person: unknown): Address | null {
  const address = readPath(person, ['contact', 'address'])
  if (!isRecord(address)) return null
  return {
    zip: readString(address, ['postal-code']) ?? '',
    street: readString(address, ['street']) ?? '',
    district: readString(address, ['neighborhood']) ?? '',
    number: readString(address, ['number']) ?? '',
    complement: readString(address, ['complement']),
    uf: readString(address, ['state']) ?? '',
    city: readString(address, ['city']) ?? '',
  }
}

function bankAccountOf(person: unknown): BankAccount | null {
  const bank = readPath(person, ['bank-data'])
  if (!isRecord(bank)) return null
  return {
    holderName: readString(bank, ['account-owners-name']) ?? '',
    holderCpf: readString(bank, ['account-owners-tax-id']) ?? '',
    bank: readString(bank, ['bank-number']) ?? '',
    agency: readString(bank, ['branch-number']) ?? '',
    account: readString(bank, ['account-number']) ?? '',
  }
}

function linkOf(person: unknown, ticket: Ticket): EmploymentLink | null {
  const job = readPath(person, ['employment'])
  if (!isRecord(job)) return null
  const salary = readNumber(job, ['monthly-salary'])
  return {
    companyId: ticket.companyId,
    contractType: ticket.contractType,
    admissionDate: readString(job, ['admission-date']),
    salaryCents: salary === null ? null : Math.round(salary * 100),
    registration: readString(job, ['employee-id']),
    jobTitle: readString(job, ['job-title']),
    costCenter: readString(job, ['cost-center']),
  }
}

interface PersonContext {
  role: Person['role']
  holderId: string | null
  link: EmploymentLink | null
  carrierId: string
  product: string
}

function personOf(raw: unknown, context: PersonContext): Person | null {
  const cpf = readString(raw, ['profile', 'tax-id'])
  const id = readString(raw, ['member-id']) ?? cpf
  if (id === null) return null
  const card = readString(raw, ['benefit', 'id-card-number'])
  return {
    id,
    name: readString(raw, ['profile', 'name']) ?? '',
    socialName: readString(raw, ['profile', 'preferred-name']),
    cpf: cpf ?? '',
    birthDate: readString(raw, ['profile', 'date-of-birth']),
    sex: SEX_OF[readString(raw, ['profile', 'gender'])?.toLowerCase() ?? ''] ?? null,
    email: readString(raw, ['contact', 'email']),
    phone: readString(raw, ['contact', 'phone']),
    maritalStatus: maritalStatusOf(readString(raw, ['profile', 'marital-status'])),
    weightKg: readNumber(raw, ['health-info', 'weight-kg']),
    heightCm: readNumber(raw, ['health-info', 'height-cm']),
    motherName: readString(raw, ['profile', 'mothers-name']),
    address: addressOf(raw),
    bankAccount: context.role === 'holder' ? bankAccountOf(raw) : null,
    role: context.role,
    holderId: context.holderId,
    link: context.link,
    cards:
      card === null
        ? []
        : [
            {
              id: `${id}-card`,
              carrierId: context.carrierId,
              product: context.product,
              number: card,
              validFrom: readString(raw, ['benefit', 'start-date']),
            },
          ],
  }
}

function documentsOf(people: unknown[], ticket: Ticket): RecordDocument[] {
  return people
    .flatMap((person) => readList(person, ['documents']))
    .flatMap((doc, index) => {
      const path = readString(doc, ['path'])
      if (path === null) return []
      return [
        {
          id: `${ticket.id}-doc-${index}`,
          name: path.slice(path.lastIndexOf('/') + 1),
          scope: 'ticket' as const,
          scopeId: ticket.id,
          origin: 'client' as const,
          kind: readString(doc, ['type']) ?? '',
          at: ticket.createdAt,
          sizeKb: null,
          note: null,
        },
      ]
    })
}

function movedDependent(snapshot: unknown, dependents: Person[]): Person | undefined {
  if (readString(snapshot, ['member-type'])?.toLowerCase() !== 'dependent') return undefined
  const memberId = readString(snapshot, ['member-id'])
  const named = dependents.find((dependent) => dependent.id === memberId)
  if (named) return named
  return dependents.length === 1 ? dependents[0] : undefined
}

export function recordsFromTicket(ticket: Ticket): TicketRecords {
  const snapshot = ticket.enrollmentSnapshot
  const carrierId = ticket.carrierId ?? readString(snapshot, ['carrier-id']) ?? ''
  const product = ticket.product ?? readString(snapshot, ['contract', 'product-type']) ?? ''

  const primary = readPath(snapshot, ['primary'])
  const holderLink = linkOf(primary, ticket)
  const holder = personOf(primary, {
    role: 'holder',
    holderId: null,
    link: holderLink,
    carrierId,
    product,
  })
  const rawDependents = readList(snapshot, ['dependents'])
  const dependents = holder
    ? rawDependents.flatMap((raw) => {
        const dependent = personOf(raw, {
          role: 'dependent',
          holderId: holder.id,
          link: holderLink,
          carrierId,
          product,
        })
        return dependent ? [dependent] : []
      })
    : []

  const companies: Company[] = []
  const tradeName = readString(snapshot, ['company', 'company-name'])
  if (tradeName !== null) {
    companies.push({
      id: ticket.companyId,
      tradeName,
      legalName: null,
      cnpj: readString(snapshot, ['company', 'company-tax-id']),
      parentId: ticket.parentCompanyId,
      porte: ticket.companySize,
      contractualSla: null,
    })
  }
  const parentName = readString(snapshot, ['company', 'parent-company-name'])
  if (ticket.parentCompanyId !== null && parentName !== null) {
    companies.push({
      id: ticket.parentCompanyId,
      tradeName: parentName,
      legalName: null,
      cnpj: readString(snapshot, ['company', 'parent-company-tax-id']),
      parentId: null,
      porte: null,
      contractualSla: null,
    })
  }

  const policyId = readString(snapshot, ['contract', 'id']) ?? `${ticket.id}-policy`
  const policy: Policy = {
    id: policyId,
    companyId: ticket.companyId,
    carrierId,
    product,
    name: readString(snapshot, ['contract', 'product-name']),
    code: readString(snapshot, ['contract', 'plan-code']),
  }
  const contractNumber = readString(snapshot, ['contract', 'contract-number'])
  const contracts: Contract[] =
    contractNumber === null
      ? []
      : [
          {
            id: policyId,
            number: contractNumber,
            companyId: ticket.companyId,
            carrierId,
            product,
            startDate: readString(snapshot, ['benefit-policy', 'coverage-start-date']),
            endDate: readString(snapshot, ['benefit-policy', 'coverage-end-date']),
            hasPendingFile: false,
            access: null,
          },
        ]

  const carrierName = ticket.carrierName ?? readString(snapshot, ['carrier-name'])
  const moved = movedDependent(snapshot, dependents)
  const movements: Movement[] = holder
    ? [
        {
          id: ticket.id,
          beneficiaryId: moved?.id ?? holder.id,
          dependentIds: moved ? [] : dependents.map((dependent) => dependent.id),
          policyId,
          pendingDocumentation: ticket.pendingDocumentation,
        },
      ]
    : []

  return indexRecords({
    companies,
    carriers: carrierName === null ? [] : [{ id: carrierId, name: carrierName, portal: null }],
    policies: [policy],
    contracts,
    documents: documentsOf([primary, ...rawDependents], ticket),
    beneficiaries: holder ? [holder, ...dependents] : [],
    tickets: movements,
    boOutageCompanyIds: [],
  })
}
