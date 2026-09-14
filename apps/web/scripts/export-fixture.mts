/** Regenerates the Pipodesk fixtures from the prototype at a pinned commit:
 *  `pnpm fixture:export <sha>` from apps/web. The README says how and why. */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/* ── The prototype's shapes this script reads, structurally and minimal. ── */

interface Company {
  id: string
  tradeName: string
  legalName: string
  cnpj: string
  parentId: string | null
  porte: string
  contractualSla?: { data: { hours: number; hasPenalty: boolean } }
}

interface Carrier {
  id: string
  name: string
}

interface Policy {
  id: string
  companyId: string
  carrierId: string
  product: string
  name: string
  code: string
}

interface Beneficiary {
  id: string
  name: string
  socialName: string | null
  cpf: string
  birthDate: string
  sex: string
  email: string
  phone: string
  maritalStatus: string
  weightKg: number | null
  heightCm: number | null
  motherName: string
  address: {
    zip: string
    street: string
    district: string
    number: string
    complement: string | null
    uf: string
    city: string
  }
  bankAccount: {
    holderName: string
    holderCpf: string
    bank: string
    agency: string
    account: string
  } | null
  role: string
  holderId: string | null
  link: {
    companyId: string
    contractType: string
    admissionDate: string
    salaryCents: number
    registration: string
    jobTitle: string | null
    costCenter: string | null
  }
  cards: { id: string; carrierId: string; product: string; number: string; validFrom: string }[]
}

interface Enrollment {
  id: string
  type: string
  beneficiaryId: string
  dependentIds: string[]
  policyId: string
  product: string
}

interface Ticket {
  id: string
  subject: string
  status: string
  origin: string
  enrollmentId: string
  companyId: string
  groupId: string
  assigneeId: string | null
  priority: string | null
  actionDate: string | null
  pendingReason: string | null
  pendingDocumentation: string[] | null
  tags: string[]
  snapshot: { carrierId: string; contractType: string }
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

interface Contract {
  id: string
  number: string
  companyId: string
  carrierId: string
  product: string
  startDate: string
  endDate: string
  hasPendingFile: boolean
  access: { login: string; password: string; updatedAt: string } | null
}

interface Document {
  id: string
  name: string
  scope: string
  scopeId: string
  origin: string
  kind: string
  at: string
  sizeKb: number
  note: string | null
}

interface Dataset {
  companies: Company[]
  carriers: Carrier[]
  policies: Policy[]
  beneficiaries: Beneficiary[]
  enrollments: Enrollment[]
  tickets: Ticket[]
  users: { id: string; name: string }[]
  groups: { id: string; name: string; parentId: string | null; companyIds: string[] }[]
  memberships: { userId: string; groupId: string; role: string; companyIds: string[] }[]
  queues: {
    id: string
    name: string
    groupId: string
    ownerId: string | null
    subscriberIds: string[]
    filter: Record<string, unknown>
    sort: Record<string, unknown>
  }[]
  contracts: Contract[]
  documents: Document[]
  boOutage: { companyIds: string[] }
}

interface QueueDataModule {
  DATASET: Dataset
  TODAY_ISO: string
  INBOX_SINCE: string
  VIEWER_ID: string
  VIEWER_IDS: readonly string[]
}

interface InboxModule {
  inboxTicketIds(viewerId: string): string[]
}

interface CarrierContactModule {
  CARRIER_CONTACT: Record<string, { portal: string }>
}

/* ── Vocabulary: the prototype's six statuses + reason become the API's eight. ── */

function apiStatusOf(ticket: Ticket): string {
  const { status, pendingReason } = ticket
  if (status === 'client-pending') {
    if (pendingReason === 'missing-documents' || pendingReason === 'incorrect-data') {
      return pendingReason
    }
    throw new Error(`ticket ${ticket.id}: client-pending sem motivo traduzível (${pendingReason})`)
  }
  if (status === 'broker-processing' && pendingReason === 'internal-issue')
    return 'broker-open-issue'
  if (pendingReason !== null) {
    throw new Error(`ticket ${ticket.id}: ${status} com motivo ${pendingReason} não tem par na API`)
  }
  return status
}

const ENROLLMENT_TYPE: Record<string, string> = {
  inclusion: 'inclusion',
  exclusion: 'exclusion',
  'plan-change': 'plan_change',
}

const SOURCE_SYSTEM: Record<string, string> = {
  'auto-routing': 'enrollment-integrations',
  'automation-failure': 'automation-failure',
  broker: 'broker',
  'back-office': 'back-office',
  agent: 'agent',
}

const translate = (table: Record<string, string>, value: string, what: string): string => {
  const translated = table[value]
  if (translated === undefined) throw new Error(`${what} fora do vocabulário: ${value}`)
  return translated
}

/* The record's closed unions: the fixture enters the app by cast, so this is
   the only place a value outside them can still be caught. */
const ROLE = ['holder', 'dependent'] as const
const MEMBER_ROLE = ['admin', 'member'] as const
const SORT_FIELD = ['actionDate', 'createdAt', 'updatedAt', 'company', 'status'] as const
const SORT_DIRECTION = ['asc', 'desc'] as const
const PRIORITY = ['urgent', 'high', 'medium', 'low'] as const
const DOCUMENT_SCOPE = ['ticket', 'company', 'contract'] as const
const DOCUMENT_ORIGIN = ['pipo', 'client'] as const
const SEX = ['f', 'm'] as const
const MARITAL_STATUS = ['single', 'married', 'divorced', 'widowed', 'domestic-partnership'] as const

const oneOf = <T extends string>(values: readonly T[], value: string, what: string): T => {
  if (!(values as readonly string[]).includes(value)) {
    throw new Error(`${what} fora do vocabulário: ${value}`)
  }
  return value as T
}

/* ── Reading the prototype at the pinned commit. ── */

function extractPrototype(repo: string, sha: string): string {
  const tar = execFileSync('git', ['-C', repo, 'archive', '--format=tar', sha, 'pipodesk/src'], {
    maxBuffer: 256 * 1024 * 1024,
  })
  const dir = mkdtempSync(join(tmpdir(), 'pipodesk-'))
  try {
    execFileSync('tar', ['-x', '-C', dir], { input: tar })
    // The mock modules are ESM without a package.json of their own.
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}')
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    throw error
  }
  return dir
}

async function main(): Promise<void> {
  const sha = process.argv[2]
  // A sha only: anything else (a flag, a ref) must not reach git archive.
  if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha)) {
    console.error('uso: pnpm fixture:export <sha do commit do protótipo>')
    process.exit(1)
  }
  const out = resolve(process.cwd(), 'src/fixtures/pipodesk')
  if (!existsSync(out)) {
    console.error(`rode de apps/web: ${out} não existe`)
    process.exit(1)
  }
  const repo = process.env.PIPODESK_PROTOTYPE ?? resolve(process.cwd(), '../../../prototipos')

  const dir = extractPrototype(repo, sha)
  try {
    const src = join(dir, 'pipodesk/src')
    const load = <T,>(file: string): Promise<T> =>
      import(pathToFileURL(join(src, file)).href) as Promise<T>
    const { DATASET, TODAY_ISO, INBOX_SINCE, VIEWER_ID, VIEWER_IDS } =
      await load<QueueDataModule>('queue/data.ts')
    const { inboxTicketIds } = await load<InboxModule>('queue/inbox.ts')
    const { CARRIER_CONTACT } = await load<CarrierContactModule>('ticket/carrier-contact.ts')

    const companyById = new Map(DATASET.companies.map((company) => [company.id, company]))
    const carrierNameById = new Map(DATASET.carriers.map((carrier) => [carrier.id, carrier.name]))
    const beneficiaryById = new Map(DATASET.beneficiaries.map((person) => [person.id, person]))
    const enrollmentById = new Map(DATASET.enrollments.map((item) => [item.id, item]))

    const enrollmentOf = (ticket: Ticket): Enrollment => {
      const enrollment = enrollmentById.get(ticket.enrollmentId)
      if (!enrollment) throw new Error(`ticket ${ticket.id} sem enrollment`)
      return enrollment
    }

    // Validated here too, so the comparison stays type-checked after `role: string`.
    const roleOf = (person: Beneficiary): (typeof ROLE)[number] =>
      oneOf(ROLE, person.role, `papel de ${person.id}`)

    const relationshipOf = (enrollment: Enrollment): string => {
      if (enrollment.dependentIds.length > 0) return 'grupo-familiar'
      const person = beneficiaryById.get(enrollment.beneficiaryId)
      return person && roleOf(person) === 'dependent' ? 'dependente' : 'titular'
    }

    const displayNameOf = (person: Beneficiary): string => person.socialName ?? person.name

    const rows = DATASET.tickets.map((ticket) => {
      const enrollment = enrollmentOf(ticket)
      const company = companyById.get(ticket.companyId)
      const parent = company?.parentId ? companyById.get(company.parentId) : undefined
      const person = beneficiaryById.get(enrollment.beneficiaryId)
      return {
        id: ticket.id,
        enrollmentId: ticket.enrollmentId,
        companyId: ticket.companyId,
        status: apiStatusOf(ticket),
        subject: ticket.subject,
        beneficiaryName: person ? displayNameOf(person) : null,
        taxId: null,
        companyName: company?.tradeName ?? null,
        parentCompanyId: parent?.id ?? null,
        parentCompanyName: parent?.tradeName ?? null,
        porte: company?.porte ?? null,
        carrierId: ticket.snapshot.carrierId,
        carrierName: carrierNameById.get(ticket.snapshot.carrierId) ?? null,
        product: enrollment.product,
        enrollmentType: translate(ENROLLMENT_TYPE, enrollment.type, 'tipo de movimentação'),
        contractType: ticket.snapshot.contractType,
        vinculo: relationshipOf(enrollment),
        assigneeId: ticket.assigneeId,
        groupId: ticket.groupId,
        priority:
          ticket.priority === null
            ? null
            : oneOf(PRIORITY, ticket.priority, `prioridade de ${ticket.id}`),
        actionDate: ticket.actionDate,
        tags: ticket.tags,
        sourceSystem: translate(SOURCE_SYSTEM, ticket.origin, 'origem'),
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        closedAt: ticket.closedAt,
      }
    })

    const dataset = {
      today: TODAY_ISO,
      viewerId: VIEWER_ID,
      inboxSince: INBOX_SINCE,
      inboxTicketIds: inboxTicketIds(VIEWER_ID),
      users: DATASET.users.map(({ id, name }) => ({ id, name })),
      companies: DATASET.companies.map((company) => ({
        id: company.id,
        tradeName: company.tradeName,
        legalName: company.legalName,
        cnpj: company.cnpj,
        parentId: company.parentId,
        porte: company.porte,
        contractualSla: company.contractualSla?.data ?? null,
      })),
      structure: {
        groups: DATASET.groups.map(({ id, name, parentId, companyIds }) => ({
          id,
          name,
          parentId,
          companyIds,
        })),
        memberships: DATASET.memberships.map(({ userId, groupId, role, companyIds }) => ({
          userId,
          groupId,
          role: oneOf(MEMBER_ROLE, role, `papel de ${userId} em ${groupId}`),
          companyIds,
        })),
        // As the prototype seeds its state: the viewers start unsubscribed.
        queues: DATASET.queues.map(
          ({ id, name, groupId, ownerId, subscriberIds, filter, sort }) => ({
            id,
            name,
            groupId,
            ownerId,
            subscriberIds: subscriberIds.filter((userId) => !VIEWER_IDS.includes(userId)),
            // `filter` stays opaque on purpose: the queue reads it through the
            // generated API types, and no field of it is closed on our side.
            filter,
            sort: {
              by: oneOf(SORT_FIELD, String(sort.by), `campo de ordenação da fila ${id}`),
              direction: oneOf(
                SORT_DIRECTION,
                String(sort.direction),
                `direção de ordenação da fila ${id}`,
              ),
            },
          }),
        ),
      },
      rows,
    }

    const records = {
      carriers: DATASET.carriers.map(({ id, name }) => ({
        id,
        name,
        portal: CARRIER_CONTACT[name]?.portal ?? null,
      })),
      policies: DATASET.policies.map(({ id, companyId, carrierId, product, name, code }) => ({
        id,
        companyId,
        carrierId,
        product,
        name,
        code,
      })),
      contracts: DATASET.contracts.map((contract) => ({
        id: contract.id,
        number: contract.number,
        companyId: contract.companyId,
        carrierId: contract.carrierId,
        product: contract.product,
        startDate: contract.startDate,
        endDate: contract.endDate,
        hasPendingFile: contract.hasPendingFile,
        access: contract.access,
      })),
      documents: DATASET.documents.map(
        ({ id, name, scope, scopeId, origin, kind, at, sizeKb, note }) => ({
          id,
          name,
          scope: oneOf(DOCUMENT_SCOPE, scope, `escopo do documento ${id}`),
          scopeId,
          origin: oneOf(DOCUMENT_ORIGIN, origin, `origem do documento ${id}`),
          kind,
          at,
          sizeKb,
          note: note ?? null,
        }),
      ),
      beneficiaries: DATASET.beneficiaries.map((person) => ({
        id: person.id,
        name: person.name,
        socialName: person.socialName,
        cpf: person.cpf,
        birthDate: person.birthDate,
        sex: oneOf(SEX, person.sex, `sexo de ${person.id}`),
        email: person.email,
        phone: person.phone,
        maritalStatus: oneOf(MARITAL_STATUS, person.maritalStatus, `estado civil de ${person.id}`),
        weightKg: person.weightKg,
        heightCm: person.heightCm,
        motherName: person.motherName,
        address: person.address,
        bankAccount: person.bankAccount,
        role: roleOf(person),
        holderId: person.holderId,
        link: {
          companyId: person.link.companyId,
          contractType: person.link.contractType,
          admissionDate: person.link.admissionDate,
          salaryCents: person.link.salaryCents,
          registration: person.link.registration,
          jobTitle: person.link.jobTitle,
          costCenter: person.link.costCenter,
        },
        cards: person.cards.map(({ id, carrierId, product, number, validFrom }) => ({
          id,
          carrierId,
          product,
          number,
          validFrom,
        })),
      })),
      tickets: DATASET.tickets.map((ticket) => {
        const enrollment = enrollmentOf(ticket)
        return {
          id: ticket.id,
          beneficiaryId: enrollment.beneficiaryId,
          dependentIds: enrollment.dependentIds,
          policyId: enrollment.policyId,
          pendingDocumentation: ticket.pendingDocumentation,
        }
      }),
      boOutageCompanyIds: DATASET.boOutage.companyIds,
    }

    writeFileSync(join(out, 'dataset.json'), JSON.stringify(dataset))
    writeFileSync(join(out, 'records.json'), JSON.stringify(records))
    console.log(
      `${sha}: ${rows.length} chamados, ${records.beneficiaries.length} beneficiários, ${records.contracts.length} contratos, ${records.documents.length} documentos`,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

await main()
