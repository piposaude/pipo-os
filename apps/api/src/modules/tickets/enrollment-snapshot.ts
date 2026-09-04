/**
 * The only module on this side that knows the enrollment_snapshot shape.
 *
 * From PD-207 on the EI sends the movement fields in the POST body; until then
 * they are read from the snapshot, which already carries them, so the column is
 * born filled instead of waiting. Read raw, in the EI's own word: the column
 * stores what the EI said and the translation happens at the edge
 * (`vocabulary.ts`).
 */

import type { z } from 'zod'
import type { relationshipSchema } from './schemas.js'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const camelOf = (key: string): string =>
  key.replace(/[-_]([a-z])/g, (_, letter: string) => letter.toUpperCase())

const snakeOf = (key: string): string => key.replace(/-/g, '_')

const kebabOf = (key: string): string => key.replace(/_/g, '-')

/** Reads a path accepting kebab, snake or camelCase per segment. The snapshot
 *  contract is not frozen (PD-001), so a separator must not decide whether a
 *  column is filled. Twin of `readPath` in web/src/lib/pipodesk/ticket-row.ts. */
function readPath(snapshot: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = snapshot
  for (const segment of path) {
    if (!isRecord(current)) return undefined
    const source = current
    const key = [segment, camelOf(segment), snakeOf(segment), kebabOf(segment)].find((candidate) =>
      Object.prototype.hasOwnProperty.call(source, candidate),
    )
    if (key === undefined) return undefined
    current = source[key]
  }
  return current
}

/** The first path holding a non-empty string. */
function readString(snapshot: Record<string, unknown>, ...paths: string[][]): string | null {
  for (const path of paths) {
    const value = readPath(snapshot, path)
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return null
}

/** One source for the enum: the same schema that validates the column on read. */
export type Relationship = z.infer<typeof relationshipSchema>

/**
 * Not a field the EI has — a property of the movement, derived here and frozen
 * at creation: the ticket is the picture of a movement, not a live mirror.
 */
export function relationshipOf(snapshot: unknown): Relationship | null {
  if (!isRecord(snapshot)) return null

  // The EI compares its own member_type with EqualFold, so case is not stable.
  const memberType = readString(snapshot, ['member-type'], ['primary', 'member-type'])
  if (memberType === null) return null
  if (memberType.toLowerCase() === 'dependent') return 'dependent'

  // `omitempty` on the Go slice: a primary with none arrives without the key.
  const dependents = readPath(snapshot, ['dependents'])
  return Array.isArray(dependents) && dependents.length > 0 ? 'family-group' : 'holder'
}

/** The five fields the EI does have, each on the paths it uses today. */
export interface MovementFields {
  carrierId: string | null
  carrierName: string | null
  product: string | null
  contractType: string | null
  companySize: string | null
}

export function movementFieldsOf(snapshot: unknown): MovementFields {
  if (!isRecord(snapshot)) {
    return {
      carrierId: null,
      carrierName: null,
      product: null,
      contractType: null,
      companySize: null,
    }
  }

  return {
    carrierId: readString(snapshot, ['carrier-id'], ['carrier', 'id']),
    carrierName: readString(snapshot, ['carrier-name'], ['carrier', 'name']),
    product: readString(snapshot, ['contract', 'product-type'], ['product-type']),
    contractType: readString(
      snapshot,
      ['primary', 'employment', 'contract-type'],
      ['work-contract-type'],
    ),
    companySize: readString(snapshot, ['company', 'company-size'], ['company', 'porte']),
  }
}
