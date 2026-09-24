// @vitest-environment node
import {
  contractExpired,
  displayNameOf,
  historyOf,
  indexRecords,
  type RecordSource,
} from '@/lib/pipodesk/record'
import type { TicketRow } from '@/lib/pipodesk/ticket-row'
import { company, person } from '../../../helpers/records'

const source: RecordSource = {
  companies: [
    company('company-1'),
    company('company-2', { parentId: 'company-1' }),
    company('company-3', { parentId: 'company-1' }),
  ],
  carriers: [{ id: 'carrier-1', name: 'Amil', portal: 'portal.amil.exemplo' }],
  policies: [
    {
      id: 'policy-1',
      companyId: 'company-1',
      carrierId: 'carrier-1',
      product: 'health',
      name: 'Amil E1',
      code: '1000',
    },
    {
      id: 'policy-2',
      companyId: 'company-2',
      carrierId: 'carrier-1',
      product: 'dental',
      name: 'Amil D1',
      code: '1001',
    },
  ],
  contracts: [
    {
      id: 'contract-1',
      number: '123456',
      companyId: 'company-1',
      carrierId: 'carrier-1',
      product: 'health',
      startDate: '2025-01-01',
      endDate: '2027-01-01',
      hasPendingFile: false,
      access: null,
    },
  ],
  documents: [
    {
      id: 'doc-1',
      name: 'RG.pdf',
      scope: 'ticket',
      scopeId: '700001',
      origin: 'client',
      kind: 'RG',
      at: '2026-07-01',
      sizeKb: 10,
      note: null,
    },
    {
      id: 'doc-2',
      name: 'QSA.pdf',
      scope: 'company',
      scopeId: 'company-1',
      origin: 'pipo',
      kind: 'QSA',
      at: '2026-01-15',
      sizeKb: 20,
      note: null,
    },
    {
      id: 'doc-3',
      name: 'Contrato.pdf',
      scope: 'contract',
      scopeId: 'contract-1',
      origin: 'pipo',
      kind: 'contrato',
      at: '2025-01-01',
      sizeKb: 30,
      note: null,
    },
  ],
  beneficiaries: [
    person('holder'),
    person('dep-1', { role: 'dependent', holderId: 'holder' }),
    person('dep-2', { role: 'dependent', holderId: 'holder' }),
    person('other'),
  ],
  tickets: [
    {
      id: '700001',
      beneficiaryId: 'holder',
      dependentIds: [],
      policyId: 'policy-1',
      pendingDocumentation: ['rg'],
    },
    {
      id: '700002',
      beneficiaryId: 'holder',
      dependentIds: ['dep-1'],
      policyId: 'policy-1',
      pendingDocumentation: null,
    },
    {
      id: '700003',
      beneficiaryId: 'other',
      dependentIds: [],
      policyId: 'policy-2',
      pendingDocumentation: null,
    },
  ],
  boOutageCompanyIds: ['company-2'],
}

const records = indexRecords(source)

describe('indexRecords', () => {
  it('should list the dependents of a holder in source order, and none for a holder without them', () => {
    expect(records.dependentsOf('holder').map((p) => p.id)).toEqual(['dep-1', 'dep-2'])
    expect(records.dependentsOf('other')).toEqual([])
  })

  it('should list the branches of a parent company', () => {
    expect(records.branchesOf('company-1').map((c) => c.id)).toEqual(['company-2', 'company-3'])
    expect(records.branchesOf('company-2')).toEqual([])
  })

  it('should index documents by scope, so a ticket id never matches a company id', () => {
    expect(records.documentsOf('ticket', '700001').map((d) => d.id)).toEqual(['doc-1'])
    expect(records.documentsOf('company', 'company-1').map((d) => d.id)).toEqual(['doc-2'])
    expect(records.documentsOf('contract', 'contract-1').map((d) => d.id)).toEqual(['doc-3'])
    expect(records.documentsOf('ticket', 'company-1')).toEqual([])
  })

  it('should find the policies and contracts of a company', () => {
    expect(records.policiesOf('company-1').map((p) => p.id)).toEqual(['policy-1'])
    expect(records.contractsOf('company-1').map((c) => c.id)).toEqual(['contract-1'])
    expect(records.contractsOf('company-3')).toEqual([])
  })

  it('should resolve the movement of a ticket, or nothing for an unknown id', () => {
    expect(records.movementOf('700001')?.beneficiaryId).toBe('holder')
    expect(records.movementOf('nope')).toBeUndefined()
  })

  it('should know which companies have the Backoffice down', () => {
    expect(records.isBackofficeDown('company-2')).toBe(true)
    expect(records.isBackofficeDown('company-1')).toBe(false)
  })
})

const row = (id: string, createdAt: string, closedAt: string | null = null): TicketRow => ({
  id,
  displayNumber: null,
  enrollmentId: `enr-${id}`,
  companyId: 'company-1',
  status: closedAt ? 'completed' : 'broker-processing',
  display: closedAt ? 'completed' : 'broker-processing',
  reason: null,
  subject: id,
  beneficiaryName: null,
  taxId: null,
  companyName: null,
  parentCompanyId: null,
  parentCompanyName: null,
  companyTaxId: null,
  companySize: null,
  carrierId: 'carrier-1',
  carrierName: 'Amil',
  product: 'health',
  enrollmentType: 'inclusion',
  contractType: 'clt',
  relationship: 'holder',
  assigneeId: null,
  groupId: 'pod-1',
  priority: null,
  actionDate: null,
  tags: [],
  sourceSystem: 'enrollment-integrations',
  createdAt,
  updatedAt: createdAt,
  closedAt,
})

describe('historyOf', () => {
  const ana = (id: string, createdAt: string) => ({ ...row(id, createdAt), taxId: '11122233344' })
  const rows = [
    ana('700001', '2026-07-01T12:00:00.000Z'),
    ana('700003', '2026-08-02T12:00:00.000Z'),
    { ...row('700004', '2026-08-03T12:00:00.000Z'), taxId: '99988877766' },
    row('700005', '2026-08-04T12:00:00.000Z'),
  ]

  it('should return the tickets with the same CPF, newest first, the current one included', () => {
    expect(historyOf(rows, rows[0]!).map((r) => r.id)).toEqual(['700003', '700001'])
  })

  it('should add the current ticket when the rows do not carry it, as a closed one', () => {
    const closed = { ...ana('700002', '2026-08-01T12:00:00.000Z'), status: 'completed' as const }

    expect(historyOf(rows, closed).map((r) => r.id)).toEqual(['700003', '700002', '700001'])
  })

  it('should show the current ticket as the detail has it, not the row copy', () => {
    const current = { ...rows[1]!, priority: 'urgent' as const }

    expect(historyOf(rows, current).find((r) => r.id === '700003')?.priority).toBe('urgent')
  })

  it('should return only the current ticket when it has no CPF', () => {
    expect(historyOf(rows, rows[3]!).map((r) => r.id)).toEqual(['700005'])
  })
})

describe('displayNameOf', () => {
  it('should prefer the social name when there is one', () => {
    expect(displayNameOf(person('a', { name: 'Carlos', socialName: 'Carla' }))).toBe('Carla')
    expect(displayNameOf(person('b', { name: 'Ana' }))).toBe('Ana')
  })
})

describe('contractExpired', () => {
  const today = '2026-08-07'

  it('should expire a contract whose term ended before today, and keep one that ends today', () => {
    expect(contractExpired('2026-08-06', today)).toBe(true)
    expect(contractExpired('2026-08-07', today)).toBe(false)
    expect(contractExpired('2027-01-01', today)).toBe(false)
  })

  /** The API may send an instant; a string comparison would call the day it
   *  ends "expired" because `T` sorts after nothing. The day is what counts. */
  it('should read an instant as its São Paulo day instead of comparing strings', () => {
    expect(contractExpired('2026-08-07T12:00:00.000Z', today)).toBe(false)
    expect(contractExpired('2026-08-06T23:00:00.000Z', today)).toBe(true)
  })

  it('should not call an unreadable date expired', () => {
    expect(contractExpired('not-a-date', today)).toBe(false)
  })
})
