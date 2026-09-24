// @vitest-environment node
import { recordsFromTicket } from '@/lib/pipodesk/snapshot'
import { apiTicket } from '../../../helpers/ticket'

const payload = {
  enrollment_id: 'enrollment-1',
  request_type: 'inclusion',
  carrier_name: 'Amil',
  company: {
    company_id: 'company-branch',
    company_name: 'Meridiano Filial',
    company_tax_id: '94180280177840',
    parent_company_name: 'Meridiano Logística',
    parent_company_tax_id: '23541772939101',
    company_size: 'corporate',
  },
  contract: {
    id: 'contract-1',
    contract_number: '123456',
    plan_code: 'E1',
    product_type: 'health',
    product_name: 'Amil S450',
  },
  benefit_policy: {
    coverage_start_date: '2025-01-01',
    coverage_end_date: '2027-01-01',
  },
  primary: {
    member_id: 'member-holder',
    profile: {
      tax_id: '11122233344',
      name: 'Ana Souza',
      preferred_name: 'Ana',
      mothers_name: 'Maria Souza',
      date_of_birth: '1990-04-02',
      gender: 'female',
      marital_status: 'married',
    },
    contact: {
      email: 'ana@exemplo.com',
      phone: '11999990000',
      address: {
        postal_code: '01000000',
        street: 'R. Um',
        number: '10',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
      },
    },
    employment: {
      admission_date: '2024-03-01',
      employee_id: 'MAT-1',
      contract_type: 'brazil-labor-law',
      job_title: 'Analista',
      monthly_salary: 5432.1,
      cost_center: 'CC-9',
    },
    bank_data: {
      bank_number: '341',
      branch_number: '0001',
      account_number: '12345-6',
      account_owners_tax_id: '11122233344',
      account_owners_name: 'Ana Souza',
    },
    health_info: { weight_kg: 60, height_cm: 165 },
    benefit: { id_card_number: 'CARD-1', start_date: '2025-02-01' },
    documents: [{ type: 'rg', path: 's3://bucket/enrollment-1/rg-ana.pdf' }],
  },
  dependents: [
    {
      member_id: 'member-dep',
      relationship: 'child',
      profile: { tax_id: '55566677788', name: 'Bia Souza', gender: 'female' },
      documents: [{ type: 'certidao', path: 's3://bucket/enrollment-1/certidao-bia.pdf' }],
    },
  ],
}

const ticket = apiTicket({
  id: 'ticket-1',
  companyId: 'company-branch',
  parentCompanyId: 'company-parent',
  carrierId: 'carrier-amil',
  carrierName: 'Amil',
  product: 'health',
  contractType: 'clt',
  companySize: 'enterprise',
  pendingDocumentation: ['comprovante-residencia'],
  createdAt: '2026-09-20T12:00:00.000Z',
  enrollmentSnapshot: payload,
})

describe('recordsFromTicket — a pessoa', () => {
  it('should read the holder from the primary block', () => {
    const holder = recordsFromTicket(ticket).personById.get('member-holder')

    expect(holder).toMatchObject({
      name: 'Ana Souza',
      socialName: 'Ana',
      cpf: '11122233344',
      birthDate: '1990-04-02',
      sex: 'f',
      maritalStatus: 'married',
      email: 'ana@exemplo.com',
      phone: '11999990000',
      motherName: 'Maria Souza',
      weightKg: 60,
      heightCm: 165,
      role: 'holder',
      holderId: null,
      address: {
        zip: '01000000',
        street: 'R. Um',
        district: 'Centro',
        number: '10',
        complement: null,
        uf: 'SP',
        city: 'São Paulo',
      },
      bankAccount: {
        holderName: 'Ana Souza',
        holderCpf: '11122233344',
        bank: '341',
        agency: '0001',
        account: '12345-6',
      },
    })
  })

  it('should take the contract type the API translated, not the raw EI word', () => {
    const holder = recordsFromTicket({ ...ticket, contractType: null }).personById.get(
      'member-holder',
    )

    expect(holder?.link?.contractType).toBe(null)
  })

  it('should read the employment as the holder link, salary in cents', () => {
    const holder = recordsFromTicket(ticket).personById.get('member-holder')

    expect(holder?.link).toEqual({
      companyId: 'company-branch',
      contractType: 'clt',
      admissionDate: '2024-03-01',
      salaryCents: 543210,
      registration: 'MAT-1',
      jobTitle: 'Analista',
      costCenter: 'CC-9',
    })
  })

  it('should read the card from the benefit block, on the ticket carrier and product', () => {
    const holder = recordsFromTicket(ticket).personById.get('member-holder')

    expect(holder?.cards).toEqual([
      {
        id: 'member-holder-card',
        carrierId: 'carrier-amil',
        product: 'health',
        number: 'CARD-1',
        validFrom: '2025-02-01',
      },
    ])
  })

  it('should hang each dependent on the holder, sharing the holder link', () => {
    const records = recordsFromTicket(ticket)
    const dependent = records.personById.get('member-dep')

    expect(dependent).toMatchObject({
      name: 'Bia Souza',
      role: 'dependent',
      holderId: 'member-holder',
      bankAccount: null,
      address: null,
    })
    expect(dependent?.link).toEqual(records.personById.get('member-holder')?.link)
    expect(records.dependentsOf('member-holder').map((p) => p.id)).toEqual(['member-dep'])
  })

  it('should leave empty what the EI did not send', () => {
    const dependent = recordsFromTicket(ticket).personById.get('member-dep')

    expect(dependent).toMatchObject({
      birthDate: null,
      maritalStatus: null,
      email: null,
      phone: null,
      motherName: null,
      weightKg: null,
      heightCm: null,
      cards: [],
    })
  })

  it('should leave sex and marital status empty when the word is not one the tab knows', () => {
    const odd = apiTicket({
      enrollmentSnapshot: {
        primary: { profile: { tax_id: '1', name: 'X', gender: 'other', marital_status: 'other' } },
      },
    })

    expect(recordsFromTicket(odd).personById.get('1')).toMatchObject({
      sex: null,
      maritalStatus: null,
    })
  })

  it('should read sex and marital status regardless of case, as the EI displays them', () => {
    const shouting = apiTicket({
      enrollmentSnapshot: {
        primary: {
          profile: { tax_id: '1', name: 'X', gender: 'Female', marital_status: 'MARRIED' },
        },
      },
    })

    expect(recordsFromTicket(shouting).personById.get('1')).toMatchObject({
      sex: 'f',
      maritalStatus: 'married',
    })
  })

  it('should key a person by CPF when the EI sent no member id', () => {
    const noMemberId = apiTicket({
      enrollmentSnapshot: { primary: { profile: { tax_id: '999', name: 'Sem Id' } } },
    })

    expect(recordsFromTicket(noMemberId).personById.get('999')?.name).toBe('Sem Id')
  })
})

describe('recordsFromTicket — a movimentação', () => {
  it('should point the movement at the holder, the dependents and the ticket policy', () => {
    expect(recordsFromTicket(ticket).movementOf('ticket-1')).toEqual({
      id: 'ticket-1',
      beneficiaryId: 'member-holder',
      dependentIds: ['member-dep'],
      policyId: 'contract-1',
      pendingDocumentation: ['comprovante-residencia'],
    })
  })

  it('should move the dependent the EI names when the member type is dependent', () => {
    const dependentMove = apiTicket({
      id: 'ticket-2',
      enrollmentSnapshot: {
        ...payload,
        member_type: 'dependent',
        member_id: 'member-dep',
        dependents: [
          ...payload.dependents,
          { member_id: 'member-dep-2', profile: { tax_id: '9' } },
        ],
      },
    })

    expect(recordsFromTicket(dependentMove).movementOf('ticket-2')).toMatchObject({
      beneficiaryId: 'member-dep',
      dependentIds: [],
    })
  })

  it('should read the member type regardless of case, as the EI compares it', () => {
    const dependentMove = apiTicket({
      id: 'ticket-4',
      enrollmentSnapshot: { ...payload, member_type: 'Dependent', member_id: 'member-dep' },
    })

    expect(recordsFromTicket(dependentMove).movementOf('ticket-4')?.beneficiaryId).toBe(
      'member-dep',
    )
  })

  it('should move the only dependent when the EI names none', () => {
    const dependentMove = apiTicket({
      id: 'ticket-3',
      enrollmentSnapshot: { ...payload, member_type: 'dependent' },
    })

    expect(recordsFromTicket(dependentMove).movementOf('ticket-3')?.beneficiaryId).toBe(
      'member-dep',
    )
  })

  it('should have no movement when the snapshot has no holder', () => {
    expect(recordsFromTicket(apiTicket({ enrollmentSnapshot: {} })).movementOf('ticket-1')).toBe(
      undefined,
    )
  })
})

describe('recordsFromTicket — a empresa e o contrato', () => {
  it('should read the company and its parent, the ids from the ticket columns', () => {
    const records = recordsFromTicket(ticket)

    expect(records.companyById.get('company-branch')).toEqual({
      id: 'company-branch',
      tradeName: 'Meridiano Filial',
      legalName: null,
      cnpj: '94180280177840',
      parentId: 'company-parent',
      porte: 'enterprise',
      contractualSla: null,
    })
    expect(records.companyById.get('company-parent')).toMatchObject({
      tradeName: 'Meridiano Logística',
      cnpj: '23541772939101',
      parentId: null,
    })
  })

  it('should take the company size the API translated, not the raw EI word', () => {
    const records = recordsFromTicket({ ...ticket, companySize: null })

    expect(records.companyById.get('company-branch')?.porte).toBe(null)
  })

  it('should have no parent when the ticket company is the parent', () => {
    const records = recordsFromTicket({ ...ticket, parentCompanyId: null })

    expect(records.companyById.get('company-branch')?.parentId).toBe(null)
    expect(records.companyById.size).toBe(1)
  })

  it('should read the contract and its policy, with the coverage as the term', () => {
    const records = recordsFromTicket(ticket)

    expect(records.policyById.get('contract-1')).toEqual({
      id: 'contract-1',
      companyId: 'company-branch',
      carrierId: 'carrier-amil',
      product: 'health',
      name: 'Amil S450',
      code: 'E1',
    })
    expect(records.contractsOf('company-branch')).toEqual([
      {
        id: 'contract-1',
        number: '123456',
        companyId: 'company-branch',
        carrierId: 'carrier-amil',
        product: 'health',
        startDate: '2025-01-01',
        endDate: '2027-01-01',
        hasPendingFile: false,
        access: null,
      },
    ])
    expect(records.carrierById.get('carrier-amil')).toEqual({
      id: 'carrier-amil',
      name: 'Amil',
      portal: null,
    })
  })
})

describe('recordsFromTicket — os documentos', () => {
  it('should list the files of the holder and of each dependent on the ticket', () => {
    const docs = recordsFromTicket(ticket).documentsOf('ticket', 'ticket-1')

    expect(
      docs.map(({ name, kind, scope, origin, at, sizeKb }) => ({
        name,
        kind,
        scope,
        origin,
        at,
        sizeKb,
      })),
    ).toEqual([
      {
        name: 'rg-ana.pdf',
        kind: 'rg',
        scope: 'ticket',
        origin: 'client',
        at: '2026-09-20T12:00:00.000Z',
        sizeKb: null,
      },
      {
        name: 'certidao-bia.pdf',
        kind: 'certidao',
        scope: 'ticket',
        origin: 'client',
        at: '2026-09-20T12:00:00.000Z',
        sizeKb: null,
      },
    ])
  })
})

describe('recordsFromTicket — a grafia', () => {
  it('should read a kebab-case snapshot the same as a snake_case one', () => {
    const kebab = apiTicket({
      enrollmentSnapshot: {
        primary: {
          'member-id': 'm1',
          profile: { 'tax-id': '1', name: 'K', 'date-of-birth': '2000-01-01' },
        },
      },
    })

    expect(recordsFromTicket(kebab).personById.get('m1')).toMatchObject({
      cpf: '1',
      birthDate: '2000-01-01',
    })
  })
})
