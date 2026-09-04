/**
 * The only module on this side that knows the enrollment_snapshot shape. Reads
 * raw: the column stores the EI's own word and `vocabulary.ts` translates at
 * the edge. A bridge until the EI sends the fields in the body (PD-207).
 */

import type { z } from 'zod'
import type { relationshipSchema } from './schemas.js'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const camelOf = (key: string): string =>
  key.replace(/[-_]([a-z])/g, (_, letter: string) => letter.toUpperCase())

const snakeOf = (key: string): string => key.replace(/-/g, '_')

const kebabOf = (key: string): string => key.replace(/_/g, '-')

/** The snapshot contract is not frozen (PD-001), so a separator must not
 *  decide whether a column is filled. Twin of `readPath` in web's ticket-row. */
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

function readString(snapshot: Record<string, unknown>, ...paths: string[][]): string | null {
  for (const path of paths) {
    const value = readPath(snapshot, path)
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return null
}

export type Relationship = z.infer<typeof relationshipSchema>

/**
 * Not a field the EI has — a property of the movement, derived here and frozen
 * at creation: the ticket is the picture of a movement, not a live mirror.
 */
export function relationshipOf(snapshot: unknown): Relationship | null {
  if (!isRecord(snapshot)) return null

  const memberType = readString(snapshot, ['member-type'], ['primary', 'member-type'])

  // The EI compares its own member_type with EqualFold, so case is not stable.
  switch (memberType?.toLowerCase()) {
    case 'dependent':
      return 'dependent'
    // Third value of the EI's vocabulary (`memberTypePhrase` in format.go):
    // the group moves, with no primary singled out.
    case 'family':
      return 'family-group'
    case 'primary': {
      // `omitempty` on the Go slice: a primary with none arrives without the key.
      const dependents = readPath(snapshot, ['dependents'])
      return Array.isArray(dependents) && dependents.length > 0 ? 'family-group' : 'holder'
    }
    // A word we do not know is not a holder: the guess freezes in the column.
    default:
      return null
  }
}

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
