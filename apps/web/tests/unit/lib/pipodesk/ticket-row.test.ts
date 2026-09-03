// @vitest-environment node
import type { Ticket } from '@pipo-os/api-client'
import { optionLabel, type LabelContext } from '@/lib/pipodesk/filter-copy'
import type { FilterField } from '@/lib/pipodesk/filter'
import {
  COMPANY_SIZE_FROM_EI,
  CONTRACT_TYPE_FROM_EI,
  PRODUCT_FROM_EI,
  toTicketRow,
} from '@/lib/pipodesk/ticket-row'

function apiTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'ticket-1',
    displayNumber: 'M000001',
    title: null,
    enrollmentId: 'enrollment-1',
    enrollmentType: 'inclusion',
    status: 'broker-processing',
    priority: null,
    actionDate: null,
    queueId: null,
    groupId: null,
    assigneeId: null,
    companyId: 'company-1',
    tags: [],
    pendingDocumentation: [],
    requester: null,
    collaborators: [],
    forceCompletion: false,
    enrollmentSnapshot: {},
    sourceSystem: 'enrollment-integrations',
    parentTicketId: null,
    closedAt: null,
    createdAt: '2026-08-10T14:30:00.000Z',
    updatedAt: '2026-08-11T09:00:00.000Z',
    ...overrides,
  }
}

describe('toTicketRow — campos do próprio ticket', () => {
  it('should carry the ticket identity and dates unchanged', () => {
    const row = toTicketRow(apiTicket({ assigneeId: 'ana@pipo.health', tags: ['produto:vida'] }))

    expect(row.id).toBe('ticket-1')
    expect(row.enrollmentId).toBe('enrollment-1')
    expect(row.companyId).toBe('company-1')
    expect(row.assigneeId).toBe('ana@pipo.health')
    expect(row.tags).toEqual(['produto:vida'])
    expect(row.createdAt).toBe('2026-08-10T14:30:00.000Z')
    expect(row.updatedAt).toBe('2026-08-11T09:00:00.000Z')
    expect(row.closedAt).toBeNull()
  })

  it('should derive the display status and reason from the api status', () => {
    expect(toTicketRow(apiTicket({ status: 'missing-documents' })).display).toBe('client-pending')
    expect(toTicketRow(apiTicket({ status: 'missing-documents' })).reason).toBe('missing-documents')
    expect(toTicketRow(apiTicket({ status: 'broker-open-issue' })).display).toBe(
      'broker-processing',
    )
    expect(toTicketRow(apiTicket({ status: 'broker-open-issue' })).reason).toBe('internal-issue')
  })

  it('should keep an empty ticket empty: no priority, no schedule, no pod', () => {
    const row = toTicketRow(apiTicket())

    expect(row.priority).toBeNull()
    expect(row.actionDate).toBeNull()
    expect(row.groupId).toBeNull()
  })

  /** The API sends a timestamp; filter, tree and timeline compare date-only. */
  it('should truncate a full ISO timestamp in actionDate to date-only', () => {
    const row = toTicketRow(apiTicket({ actionDate: '2026-09-05T12:00:00.000Z' }))

    expect(row.actionDate).toBe('2026-09-05')
  })

  it('should carry the operational number the api generates', () => {
    expect(toTicketRow(apiTicket({ displayNumber: 'M000123' })).displayNumber).toBe('M000123')
  })

  it('should carry priority, action date and pod', () => {
    const row = toTicketRow(
      apiTicket({ priority: 'urgent', actionDate: '2026-09-01', groupId: 'pod-5' }),
    )

    expect(row.priority).toBe('urgent')
    expect(row.actionDate).toBe('2026-09-01')
    expect(row.groupId).toBe('pod-5')
  })
})

describe('toTicketRow — derivação do enrollmentSnapshot', () => {
  const snapshot = {
    'member-type': 'primary',
    primary: {
      profile: { name: 'Renata Henriques Junqueira', 'tax-id': '266.348.750-73' },
      employment: { 'contract-type': 'brazil-labor-law' },
    },
    dependents: [],
    company: { 'company-name': 'Caiçara Metalurgia', 'company-size': 'corporate' },
    'carrier-id': 'carrier-unimed',
    'carrier-name': 'Unimed Mineira',
    contract: { 'product-type': 'life' },
  }

  it('should read beneficiary, company, carrier and product from the snapshot', () => {
    const row = toTicketRow(apiTicket({ enrollmentSnapshot: snapshot }))

    expect(row.beneficiaryName).toBe('Renata Henriques Junqueira')
    expect(row.taxId).toBe('266.348.750-73')
    expect(row.companyName).toBe('Caiçara Metalurgia')
    expect(row.companySize).toBe('enterprise')
    expect(row.carrierId).toBe('carrier-unimed')
    expect(row.carrierName).toBe('Unimed Mineira')
    expect(row.product).toBe('life')
    expect(row.contractType).toBe('clt')
  })

  it('should prefer the social name over the registered name', () => {
    const row = toTicketRow(
      apiTicket({
        enrollmentSnapshot: {
          primary: { profile: { name: 'Registro Legal', 'preferred-name': 'Nome Social' } },
        },
      }),
    )

    expect(row.beneficiaryName).toBe('Nome Social')
  })

  it('should translate the EI vocabulary into the one the app speaks', () => {
    const row = toTicketRow(
      apiTicket({
        enrollmentSnapshot: {
          company: { 'company-size': 'smb-plus' },
          contract: { 'product-type': 'pet-insurance' },
          primary: { employment: { 'contract-type': 'services-contract' } },
        },
      }),
    )

    expect(row.companySize).toBe('pme-plus')
    expect(row.product).toBe('pet')
    expect(row.contractType).toBe('pj')
  })

  it('should read member-type without depending on case, as the EI does not fix it', () => {
    const row = toTicketRow(
      apiTicket({ enrollmentSnapshot: { 'member-type': 'Dependent', dependents: [] } }),
    )

    expect(row.relationship).toBe('dependent')
  })

  it('should pass an unmapped value through instead of dropping it', () => {
    const row = toTicketRow(
      apiTicket({
        enrollmentSnapshot: { primary: { employment: { 'contract-type': 'intern' } } },
      }),
    )

    expect(row.contractType).toBe('intern')
  })

  it('should accept camelCase keys as well, since the snapshot contract is not frozen yet', () => {
    const row = toTicketRow(
      apiTicket({
        enrollmentSnapshot: {
          memberType: 'primary',
          primary: { profile: { name: 'Ana', taxId: '111' } },
          company: { companyName: 'Empresa X', companySize: 'smb' },
          carrierName: 'SulAmérica',
        },
      }),
    )

    expect(row.beneficiaryName).toBe('Ana')
    expect(row.taxId).toBe('111')
    expect(row.companyName).toBe('Empresa X')
    expect(row.companySize).toBe('pme')
    expect(row.carrierName).toBe('SulAmérica')
  })

  it('should return nulls for an empty snapshot instead of throwing', () => {
    const row = toTicketRow(apiTicket({ enrollmentSnapshot: {} }))

    expect(row.beneficiaryName).toBeNull()
    expect(row.companyName).toBeNull()
    expect(row.companySize).toBeNull()
    expect(row.carrierId).toBeNull()
    expect(row.product).toBeNull()
    expect(row.contractType).toBeNull()
    expect(row.relationship).toBeNull()
  })
})

describe('toTicketRow — derived relationship', () => {
  it('should be holder for a primary member without dependents', () => {
    const row = toTicketRow(
      apiTicket({ enrollmentSnapshot: { 'member-type': 'primary', dependents: [] } }),
    )

    expect(row.relationship).toBe('holder')
  })

  it('should be family-group for a primary member that brings dependents along', () => {
    const row = toTicketRow(
      apiTicket({
        enrollmentSnapshot: { 'member-type': 'primary', dependents: [{ 'member-id': 'd1' }] },
      }),
    )

    expect(row.relationship).toBe('family-group')
  })

  it('should be dependent when the moved member is the dependent', () => {
    const row = toTicketRow(
      apiTicket({ enrollmentSnapshot: { 'member-type': 'dependent', dependents: [] } }),
    )

    expect(row.relationship).toBe('dependent')
  })
})

describe('toTicketRow — assunto da linha', () => {
  it('should use the ticket title when the api provides one', () => {
    const row = toTicketRow(apiTicket({ title: 'Assunto vindo do EI' }))

    expect(row.subject).toBe('Assunto vindo do EI')
  })

  it('should build a readable subject from the snapshot when there is no title', () => {
    const row = toTicketRow(
      apiTicket({
        enrollmentSnapshot: {
          'carrier-name': 'Unimed Mineira',
          contract: { 'product-type': 'life' },
          primary: { profile: { name: 'Renata Henriques Junqueira' } },
        },
      }),
    )

    expect(row.subject).toBe('Unimed Mineira · life · Renata Henriques Junqueira')
  })

  it('should fall back to the ticket id when there is nothing to build a subject from', () => {
    expect(toTicketRow(apiTicket()).subject).toBe('ticket-1')
  })
})

/**
 * The mapper must land on a value the rest of the app can name. Without this,
 * a de-para pointing at a word no copy table knows renders the raw code and
 * nobody notices — which is how the product gap in this file was missed once.
 */
describe('the EI maps translate into values the app can label', () => {
  const ctx: LabelContext = {
    companyName: (id) => id,
    carrierName: (id) => id,
    userName: (id) => id,
  }

  it.each([
    ['companySizes' as FilterField, COMPANY_SIZE_FROM_EI],
    ['contractTypes' as FilterField, CONTRACT_TYPE_FROM_EI],
    ['products' as FilterField, PRODUCT_FROM_EI],
  ])('should give every %s target a label of its own', (field, map) => {
    for (const target of Object.values(map)) {
      expect(optionLabel(field, target, ctx)).not.toBe(target)
    }
  })
})
