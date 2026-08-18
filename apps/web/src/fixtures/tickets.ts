import type { Ticket } from '@pipo-os/api-client'

const base = {
  queueId: null,
  assigneeId: null,
  tags: [],
  forceCompletion: false,
  enrollmentSnapshot: {},
  parentTicketId: null,
  closedAt: null,
}

export const ticketsFixture: Ticket[] = [
  {
    id: crypto.randomUUID(),
    enrollmentId: crypto.randomUUID(),
    enrollmentType: 'inclusion',
    companyId: crypto.randomUUID(),
    status: 'broker-processing',
    sourceSystem: 'enrollment-integrations',
    createdAt: '2026-08-10T14:30:00.000Z',
    updatedAt: '2026-08-10T14:30:00.000Z',
    ...base,
  },
  {
    id: crypto.randomUUID(),
    enrollmentId: crypto.randomUUID(),
    enrollmentType: 'exclusion',
    companyId: crypto.randomUUID(),
    status: 'broker-processing',
    sourceSystem: 'enrollment-integrations',
    createdAt: '2026-08-11T09:15:00.000Z',
    updatedAt: '2026-08-11T09:15:00.000Z',
    ...base,
  },
  {
    id: crypto.randomUUID(),
    enrollmentId: crypto.randomUUID(),
    enrollmentType: 'update',
    companyId: crypto.randomUUID(),
    status: 'completed',
    sourceSystem: 'enrollment-integrations',
    closedAt: '2026-08-12T10:00:00.000Z',
    createdAt: '2026-08-12T08:00:00.000Z',
    updatedAt: '2026-08-12T10:00:00.000Z',
    ...base,
  },
]
