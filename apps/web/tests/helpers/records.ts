import {
  indexRecords,
  type Company,
  type EmploymentLink,
  type Person,
  type RecordSource,
  type TicketRecords,
} from '@/lib/pipodesk/record'

export const link = (overrides: Partial<EmploymentLink> = {}): EmploymentLink => ({
  companyId: 'company-1',
  contractType: 'clt',
  admissionDate: '2020-01-01',
  salaryCents: 0,
  registration: '1',
  jobTitle: null,
  costCenter: null,
  ...overrides,
})

export const person = (id: string, overrides: Partial<Person> = {}): Person => ({
  id,
  name: `Pessoa ${id}`,
  socialName: null,
  cpf: '00000000000',
  birthDate: '1990-01-01',
  sex: 'f',
  email: `${id}@exemplo.com`,
  phone: '(11) 90000-0000',
  maritalStatus: 'single',
  weightKg: null,
  heightCm: null,
  motherName: 'Mãe',
  address: {
    zip: '01000000',
    street: 'R. UM',
    district: 'CENTRO',
    number: '1',
    complement: null,
    uf: 'SP',
    city: 'São Paulo',
  },
  bankAccount: null,
  role: 'holder',
  holderId: null,
  link: link(),
  cards: [],
  ...overrides,
})

export const company = (id: string, overrides: Partial<Company> = {}): Company => ({
  id,
  tradeName: `Empresa ${id}`,
  legalName: `Empresa ${id} ME`,
  cnpj: '00.000.000/0001-00',
  parentId: null,
  porte: 'pme',
  contractualSla: null,
  ...overrides,
})

/** One company, one holder, nothing else — each test adds what it needs. */
export const recordsWith = (overrides: Partial<RecordSource> = {}): TicketRecords =>
  indexRecords({
    companies: [company('company-1')],
    carriers: [{ id: 'carrier-1', name: 'Amil', portal: null }],
    policies: [],
    contracts: [],
    documents: [],
    beneficiaries: [person('holder')],
    tickets: [],
    boOutageCompanyIds: [],
    ...overrides,
  })
