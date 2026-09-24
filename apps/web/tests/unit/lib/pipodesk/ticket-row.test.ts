// @vitest-environment node
import {
  companyTitleOf,
  principalIdOf,
  principalNameOf,
  toTicketRow,
} from '@/lib/pipodesk/ticket-row'
import { apiTicket } from '../../../helpers/ticket'

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

  /** The day is São Paulo's, not UTC's: 01:30Z is still 22:30 of the day before. */
  it('should read the action date as a São Paulo day, not a UTC one', () => {
    const row = toTicketRow(apiTicket({ actionDate: '2026-09-05T01:30:00.000Z' }))

    expect(row.actionDate).toBe('2026-09-04')
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
    primary: {
      profile: { name: 'Renata Henriques Junqueira', 'tax-id': '266.348.750-73' },
    },
    company: { 'company-name': 'Caiçara Metalurgia' },
  }

  it('should read the person and the company, which have no column', () => {
    const row = toTicketRow(apiTicket({ enrollmentSnapshot: snapshot }))

    expect(row.beneficiaryName).toBe('Renata Henriques Junqueira')
    expect(row.taxId).toBe('266.348.750-73')
    expect(row.companyName).toBe('Caiçara Metalurgia')
  })

  /** These five stopped being derived here: the API resolves them on the way in
   *  and answers in the client's vocabulary. */
  it('should take the movement fields from the ticket, not the snapshot', () => {
    const row = toTicketRow(
      apiTicket({
        enrollmentSnapshot: { company: { 'company-size': 'corporate' } },
        carrierId: 'carrier-unimed',
        carrierName: 'Unimed Mineira',
        product: 'health',
        contractType: 'clt',
        companySize: 'enterprise',
        relationship: 'family-group',
      }),
    )

    expect(row.carrierId).toBe('carrier-unimed')
    expect(row.product).toBe('health')
    expect(row.contractType).toBe('clt')
    expect(row.relationship).toBe('family-group')
    expect(row.companySize).toBe('enterprise')
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

  it('should accept camelCase keys as well, since the snapshot contract is not frozen yet', () => {
    const row = toTicketRow(
      apiTicket({
        enrollmentSnapshot: {
          primary: { profile: { name: 'Ana', taxId: '111' } },
          company: { companyName: 'Empresa X' },
        },
      }),
    )

    expect(row.beneficiaryName).toBe('Ana')
    expect(row.taxId).toBe('111')
    expect(row.companyName).toBe('Empresa X')
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

/** The API resolves `subjectQuery` against this same subject, built in SQL:
 *  see `rows-routes.test.ts` in apps/api. Change one, change both. */
describe('toTicketRow — assunto da linha', () => {
  it('should use the ticket title when the api provides one', () => {
    const row = toTicketRow(apiTicket({ title: 'Assunto vindo do EI' }))

    expect(row.subject).toBe('Assunto vindo do EI')
  })

  it('should build a readable subject when there is no title', () => {
    const row = toTicketRow(
      apiTicket({
        carrierName: 'Unimed Mineira',
        product: 'life',
        enrollmentSnapshot: { primary: { profile: { name: 'Renata Henriques Junqueira' } } },
      }),
    )

    expect(row.subject).toBe('Unimed Mineira · life · Renata Henriques Junqueira')
  })

  it('should fall back to the ticket id when there is nothing to build a subject from', () => {
    expect(toTicketRow(apiTicket()).subject).toBe('ticket-1')
  })
})

describe('empresa matriz na projeção da API', () => {
  const daFilial = apiTicket({
    companyId: 'company-filial',
    parentCompanyId: 'company-matriz',
    parentCompanyName: 'Meridiano Holding',
    companyTaxId: '11.111.111/0001-11',
    enrollmentSnapshot: { company: { 'company-name': 'Meridiano Filial SP' } },
  })

  it('should carry the parent company and the CNPJ the API sends', () => {
    const row = toTicketRow(daFilial)

    expect(row.parentCompanyId).toBe('company-matriz')
    expect(row.parentCompanyName).toBe('Meridiano Holding')
    expect(row.companyTaxId).toBe('11.111.111/0001-11')
  })

  it('should group a branch under its parent, and name the pair on hover', () => {
    const row = toTicketRow(daFilial)

    expect(principalIdOf(row)).toBe('company-matriz')
    expect(principalNameOf(row)).toBe('Meridiano Holding')
    expect(companyTitleOf(row)).toBe('Meridiano Holding › Meridiano Filial SP')
  })

  it('should fall back to the ticket own company when it has no parent', () => {
    const row = toTicketRow(apiTicket())

    expect(principalIdOf(row)).toBe(row.companyId)
    expect(principalNameOf(row)).toBe(row.companyName)
    expect(companyTitleOf(row)).toBe(row.companyName ?? undefined)
  })
})
