import type {
  Ticket,
  Relationship as ApiRelationship,
  TicketPriority as ApiPriority,
} from '@pipo-os/api-client'
import type { ApiStatus, DisplayStatus, PendingReason } from './status'
import { toDisplayStatus } from './status'

/**
 * A flat queue row with everything table, filter, sort and grouping need.
 * The ONLY module that knows the `enrollmentSnapshot` shape (decision D4) —
 * isolating the read here keeps the rest pure, and a snapshot contract change
 * (RFC PD-001) costs one file, not the whole queue.
 */

export type Priority = ApiPriority
export type Relationship = ApiRelationship

export interface TicketRow {
  id: string
  /** Human-readable id (`M000123`) — the ID column and search key. */
  displayNumber: string | null
  enrollmentId: string
  companyId: string
  /** Status as the API stores it (8 values). Every write uses this one. */
  status: ApiStatus
  /** Status as the UI shows it (6 values) + separate reason. */
  display: DisplayStatus
  reason: PendingReason | null
  subject: string
  beneficiaryName: string | null
  taxId: string | null
  companyName: string | null
  companySize: string | null
  carrierId: string | null
  carrierName: string | null
  product: string | null
  enrollmentType: string
  contractType: string | null
  relationship: Relationship | null
  assigneeId: string | null
  groupId: string | null
  priority: Priority | null
  /** Date-only (`YYYY-MM-DD`). Every consumer compares strings against
   *  date-only cuts; `toTicketRow` truncates whatever the API sends. */
  actionDate: string | null
  tags: string[]
  sourceSystem: string
  createdAt: string
  updatedAt: string
  closedAt: string | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** `member-type` (how EI serializes today) and `memberType` are the same key. */
const camelOf = (key: string): string =>
  key.replace(/[-_]([a-z])/g, (_, letter: string) => letter.toUpperCase())

const snakeOf = (key: string): string => key.replace(/[-]/g, '_')

/**
 * Reads a snapshot path accepting kebab/snake/camelCase per segment. The
 * contract is not frozen yet (RFC PD-001); a hyphen must not blank the queue.
 */
function readPath(source: Record<string, unknown>, path: string[]): unknown {
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

function readString(source: Record<string, unknown>, ...paths: string[][]): string | null {
  for (const path of paths) {
    const value = readPath(source, path)
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return null
}

function readRelationship(snapshot: Record<string, unknown>): Relationship | null {
  const memberType = readString(snapshot, ['member-type'], ['primary', 'member-type'])
  if (memberType === null) return null
  if (memberType === 'dependent') return 'dependent'
  const dependents = readPath(snapshot, ['dependents'])
  return Array.isArray(dependents) && dependents.length > 0 ? 'family-group' : 'holder'
}

/** Subject shaped like the Zendesk one: carrier · product · person. */
function buildSubject(ticket: Ticket, snapshot: Record<string, unknown>): string {
  const explicit =
    typeof ticket.title === 'string' && ticket.title.trim() !== '' ? ticket.title : null
  if (explicit) return explicit

  const parts = [
    readString(snapshot, ['carrier-name'], ['carrier', 'name']),
    readString(snapshot, ['contract', 'product-type'], ['product-type']),
    readString(snapshot, ['primary', 'profile', 'preferred-name'], ['primary', 'profile', 'name']),
  ].filter((part): part is string => part !== null)

  return parts.length > 0 ? parts.join(' · ') : ticket.id
}

export function toTicketRow(ticket: Ticket): TicketRow {
  const snapshot = isRecord(ticket.enrollmentSnapshot) ? ticket.enrollmentSnapshot : {}
  const { status: display, reason } = toDisplayStatus(ticket.status)

  return {
    id: ticket.id,
    displayNumber: ticket.displayNumber,
    enrollmentId: ticket.enrollmentId,
    companyId: ticket.companyId,
    status: ticket.status,
    display,
    reason,
    subject: buildSubject(ticket, snapshot),
    beneficiaryName: readString(
      snapshot,
      ['primary', 'profile', 'preferred-name'],
      ['primary', 'profile', 'name'],
    ),
    taxId: readString(snapshot, ['primary', 'profile', 'tax-id']),
    companyName: readString(snapshot, ['company', 'company-name'], ['company', 'name']),
    companySize: readString(snapshot, ['company', 'company-size'], ['company', 'porte']),
    carrierId: readString(snapshot, ['carrier-id'], ['carrier', 'id']),
    carrierName: readString(snapshot, ['carrier-name'], ['carrier', 'name']),
    product: readString(snapshot, ['contract', 'product-type'], ['product-type']),
    enrollmentType: ticket.enrollmentType,
    contractType: readString(
      snapshot,
      ['primary', 'employment', 'contract-type'],
      ['work-contract-type'],
    ),
    relationship: readRelationship(snapshot),
    assigneeId: ticket.assigneeId,
    groupId: ticket.groupId,
    priority: ticket.priority,
    // The API sends a timestamp; every cut here compares date-only.
    actionDate: ticket.actionDate?.slice(0, 10) ?? null,
    tags: ticket.tags,
    sourceSystem: ticket.sourceSystem,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    closedAt: ticket.closedAt,
  }
}
