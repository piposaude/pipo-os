// @vitest-environment node
import type { TicketRow } from '@/lib/pipodesk/ticket-row'
import {
  applyFilter,
  countByOption,
  isSleeping,
  matchesFilter,
  pinsOneAssignee,
  sinceOf,
  windowOf,
} from '@/lib/pipodesk/filter'

const TODAY = '2026-08-31'
const VIEWER = 'ana@pipo.health'

function row(overrides: Partial<TicketRow> & { id: string }): TicketRow {
  return {
    enrollmentId: 'e',
    companyId: 'company-1',
    status: 'broker-processing',
    display: 'broker-processing',
    reason: null,
    subject: 's',
    beneficiaryName: null,
    taxId: null,
    companyName: null,
    porte: null,
    carrierId: null,
    carrierName: null,
    product: null,
    enrollmentType: 'inclusion',
    contractType: null,
    vinculo: null,
    assigneeId: null,
    groupId: null,
    priority: null,
    actionDate: null,
    tags: [],
    sourceSystem: 'enrollment-integrations',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    closedAt: null,
    ...overrides,
  }
}

describe('matchesFilter — an empty filter matches everything', () => {
  it('should match a ticket when no field is set', () => {
    expect(matchesFilter(row({ id: 'a' }), {}, VIEWER)).toBe(true)
  })
})

describe('matchesFilter — single value fields', () => {
  const cases: Array<
    [string, Partial<TicketRow>, Record<string, unknown>, Record<string, unknown>]
  > = [
    [
      'statuses',
      { status: 'missing-documents' },
      { statuses: ['missing-documents'] },
      { statuses: ['completed'] },
    ],
    ['companyIds', { companyId: 'c-9' }, { companyIds: ['c-9'] }, { companyIds: ['c-1'] }],
    [
      'carrierIds',
      { carrierId: 'unimed' },
      { carrierIds: ['unimed'] },
      { carrierIds: ['sulamerica'] },
    ],
    ['products', { product: 'life' }, { products: ['life'] }, { products: ['health'] }],
    ['types', { enrollmentType: 'exclusion' }, { types: ['exclusion'] }, { types: ['inclusion'] }],
    ['portes', { porte: 'enterprise' }, { portes: ['enterprise'] }, { portes: ['pme'] }],
    [
      'contractTypes',
      { contractType: 'services-contract' },
      { contractTypes: ['services-contract'] },
      { contractTypes: ['brazil-labor-law'] },
    ],
    [
      'vinculos',
      { vinculo: 'dependente' },
      { vinculos: ['dependente'] },
      { vinculos: ['titular'] },
    ],
    [
      'origins',
      { sourceSystem: 'cs-gateway' },
      { origins: ['cs-gateway'] },
      { origins: ['enrollment-integrations'] },
    ],
    ['groupIds', { groupId: 'pod-5' }, { groupIds: ['pod-5'] }, { groupIds: ['pod-1'] }],
  ]

  for (const [field, ticketPart, matching, notMatching] of cases) {
    it(`should filter by ${field}`, () => {
      const ticket = row({ id: 'a', ...ticketPart })
      expect(matchesFilter(ticket, matching, VIEWER)).toBe(true)
      expect(matchesFilter(ticket, notMatching, VIEWER)).toBe(false)
    })
  }

  it('should not match when the derived field is null and the filter asks for a value', () => {
    expect(matchesFilter(row({ id: 'a', product: null }), { products: ['life'] }, VIEWER)).toBe(
      false,
    )
  })
})

describe('matchesFilter — tags are AND, not OR', () => {
  it('should require every requested tag', () => {
    const ticket = row({ id: 'a', tags: ['produto:vida', 'pj_mov', 'risco_carencia'] })

    expect(matchesFilter(ticket, { tags: ['produto:vida', 'pj_mov'] }, VIEWER)).toBe(true)
    expect(matchesFilter(ticket, { tags: ['produto:vida', 'inexistente'] }, VIEWER)).toBe(false)
  })
})

describe('matchesFilter — assignee', () => {
  it('should resolve @me to the viewer, which is what makes a pod queue shareable', () => {
    const mine = row({ id: 'a', assigneeId: VIEWER })
    const theirs = row({ id: 'b', assigneeId: 'bruno@pipo.health' })

    expect(matchesFilter(mine, { assigneeIds: ['@me'] }, VIEWER)).toBe(true)
    expect(matchesFilter(theirs, { assigneeIds: ['@me'] }, VIEWER)).toBe(false)
  })

  it('should treat null as a real value, meaning free in the pod', () => {
    const free = row({ id: 'a', assigneeId: null })
    const taken = row({ id: 'b', assigneeId: VIEWER })

    expect(matchesFilter(free, { assigneeIds: [null] }, VIEWER)).toBe(true)
    expect(matchesFilter(taken, { assigneeIds: [null] }, VIEWER)).toBe(false)
  })
})

describe('matchesFilter — priority', () => {
  it('should treat null as the "no priority" option', () => {
    expect(matchesFilter(row({ id: 'a', priority: null }), { priorities: [null] }, VIEWER)).toBe(
      true,
    )
    expect(
      matchesFilter(row({ id: 'a', priority: 'urgent' }), { priorities: [null] }, VIEWER),
    ).toBe(false)
    expect(
      matchesFilter(row({ id: 'a', priority: 'urgent' }), { priorities: ['urgent'] }, VIEWER),
    ).toBe(true)
  })
})

describe('matchesFilter — dates', () => {
  it('should filter by createdSince', () => {
    const ticket = row({ id: 'a', createdAt: '2026-08-10T00:00:00.000Z' })

    expect(matchesFilter(ticket, { createdSince: '2026-08-01' }, VIEWER)).toBe(true)
    expect(matchesFilter(ticket, { createdSince: '2026-08-20' }, VIEWER)).toBe(false)
  })

  it('should filter by actionDateBefore, excluding tickets without an action date', () => {
    expect(
      matchesFilter(
        row({ id: 'a', actionDate: '2026-08-30' }),
        { actionDateBefore: '2026-08-31' },
        VIEWER,
      ),
    ).toBe(true)
    expect(
      matchesFilter(
        row({ id: 'a', actionDate: '2026-09-05' }),
        { actionDateBefore: '2026-08-31' },
        VIEWER,
      ),
    ).toBe(false)
    expect(
      matchesFilter(row({ id: 'a', actionDate: null }), { actionDateBefore: '2026-08-31' }, VIEWER),
    ).toBe(false)
  })

  it('should filter archived in and out', () => {
    const open = row({ id: 'a', closedAt: null })
    const closed = row({ id: 'b', closedAt: '2026-08-20T00:00:00.000Z' })

    expect(matchesFilter(open, { archived: false }, VIEWER)).toBe(true)
    expect(matchesFilter(closed, { archived: false }, VIEWER)).toBe(false)
    expect(matchesFilter(closed, { archived: true }, VIEWER)).toBe(true)
    expect(matchesFilter(open, { archived: true }, VIEWER)).toBe(false)
  })
})

describe('matchesFilter — urgentBy is the only OR in the filter', () => {
  it('should match an urgent ticket even when its action date is in the future', () => {
    const urgent = row({ id: 'a', priority: 'urgent', actionDate: '2026-12-01' })

    expect(matchesFilter(urgent, { urgentBy: TODAY }, VIEWER)).toBe(true)
  })

  it('should match an overdue ticket even when it has no priority', () => {
    const overdue = row({ id: 'a', priority: null, actionDate: '2026-08-20' })

    expect(matchesFilter(overdue, { urgentBy: TODAY }, VIEWER)).toBe(true)
  })

  it('should not match a calm ticket that is neither urgent nor overdue', () => {
    const calm = row({ id: 'a', priority: 'low', actionDate: '2026-12-01' })

    expect(matchesFilter(calm, { urgentBy: TODAY }, VIEWER)).toBe(false)
  })
})

describe('matchesFilter — global search fields', () => {
  it('should filter by ticket ids and tax ids', () => {
    const ticket = row({ id: 'ticket-9', taxId: '266.348.750-73' })

    expect(matchesFilter(ticket, { ticketIds: ['ticket-9'] }, VIEWER)).toBe(true)
    expect(matchesFilter(ticket, { ticketIds: ['other'] }, VIEWER)).toBe(false)
    expect(matchesFilter(ticket, { taxIds: ['266.348.750-73'] }, VIEWER)).toBe(true)
    expect(matchesFilter(ticket, { taxIds: ['000'] }, VIEWER)).toBe(false)
  })

  /** Empty lists mean opposite things: `statuses: []` is "nothing checked"
   *  (no restriction); `ticketIds: []` is a query RESULT (match nothing). */
  it('should match nothing when the id list is present and empty', () => {
    const ticket = row({ id: 'ticket-9', taxId: '266.348.750-73' })

    expect(matchesFilter(ticket, { ticketIds: [] }, VIEWER)).toBe(false)
    expect(matchesFilter(ticket, { taxIds: [] }, VIEWER)).toBe(false)
  })

  it('should keep an empty multi-select meaning "no restriction"', () => {
    const ticket = row({ id: 'ticket-9' })

    expect(matchesFilter(ticket, { statuses: [], companyIds: [], tags: [] }, VIEWER)).toBe(true)
  })
})

describe('matchesFilter — fields combine with AND', () => {
  it('should require every set field to match', () => {
    const ticket = row({ id: 'a', product: 'life', porte: 'pme' })

    expect(matchesFilter(ticket, { products: ['life'], portes: ['pme'] }, VIEWER)).toBe(true)
    expect(matchesFilter(ticket, { products: ['life'], portes: ['enterprise'] }, VIEWER)).toBe(
      false,
    )
  })
})

describe('isSleeping and windowOf', () => {
  it('should treat an action date more than two days ahead as sleeping', () => {
    expect(isSleeping(row({ id: 'a', actionDate: '2026-09-05' }), TODAY)).toBe(true)
    expect(isSleeping(row({ id: 'a', actionDate: '2026-09-02' }), TODAY)).toBe(false)
    expect(isSleeping(row({ id: 'a', actionDate: null }), TODAY)).toBe(false)
  })

  it('should wake a ticket up two days before its action date', () => {
    expect(isSleeping(row({ id: 'a', actionDate: '2026-09-02' }), TODAY)).toBe(false)
  })

  it('should keep only live and awake tickets in the awake window', () => {
    const rows = [
      row({ id: 'acordado', actionDate: null }),
      row({ id: 'dormindo', actionDate: '2026-10-01' }),
      row({ id: 'fechado', closedAt: '2026-08-01T00:00:00.000Z' }),
    ]

    expect(windowOf(rows, 'awake', TODAY).map((r) => r.id)).toEqual(['acordado'])
    expect(windowOf(rows, 'sleeping', TODAY).map((r) => r.id)).toEqual(['dormindo'])
    expect(windowOf(rows, 'all', TODAY).map((r) => r.id)).toEqual([
      'acordado',
      'dormindo',
      'fechado',
    ])
  })
})

describe('sinceOf', () => {
  it('should return the cut date for a window of days, counted from the given today', () => {
    expect(sinceOf(7, TODAY)).toBe('2026-08-24')
    expect(sinceOf(30, TODAY)).toBe('2026-08-01')
  })
})

describe('pinsOneAssignee', () => {
  it('should be true when the filter pins the queue to a single person', () => {
    expect(pinsOneAssignee({ assigneeIds: ['@me'] }, VIEWER)).toBe(true)
    expect(pinsOneAssignee({ assigneeIds: ['@me', VIEWER] }, VIEWER)).toBe(true)
    expect(pinsOneAssignee({ assigneeIds: [null] }, VIEWER)).toBe(true)
  })

  it('should be false when the filter allows more than one owner, or none at all', () => {
    expect(pinsOneAssignee({ assigneeIds: ['@me', null] }, VIEWER)).toBe(false)
    expect(pinsOneAssignee({}, VIEWER)).toBe(false)
  })
})

describe('applyFilter and countByOption', () => {
  it('should filter a list', () => {
    const rows = [row({ id: 'a', product: 'life' }), row({ id: 'b', product: 'health' })]

    expect(applyFilter(rows, { products: ['life'] }, VIEWER).map((r) => r.id)).toEqual(['a'])
  })

  it('should count how many tickets each option would bring', () => {
    const rows = [
      row({ id: 'a', product: 'life' }),
      row({ id: 'b', product: 'life' }),
      row({ id: 'c', product: 'health' }),
    ]

    expect(countByOption(rows, 'products')).toEqual(
      new Map([
        ['life', 2],
        ['health', 1],
      ]),
    )
  })

  it('should count tags per occurrence, since a ticket can carry several', () => {
    const rows = [row({ id: 'a', tags: ['x', 'y'] }), row({ id: 'b', tags: ['x'] })]

    expect(countByOption(rows, 'tags')).toEqual(
      new Map([
        ['x', 2],
        ['y', 1],
      ]),
    )
  })

  it('should use sentinels for the null options, so the popover can offer them', () => {
    const rows = [row({ id: 'a', assigneeId: null, priority: null })]

    expect(countByOption(rows, 'assigneeIds').get('livre')).toBe(1)
    expect(countByOption(rows, 'priorities').get('sem')).toBe(1)
  })
})
