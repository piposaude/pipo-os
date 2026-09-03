/**
 * Not a field the EI has — a property of the movement, derived here and frozen
 * at creation: the ticket is the picture of a movement, not a live mirror.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The snapshot contract is not frozen (PD-001), so a separator must not decide
 *  whether the Vínculo column renders. */
function read(snapshot: Record<string, unknown>, key: string): unknown {
  const camel = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
  const kebab = key.replace(/_/g, '-')
  const found = [key, camel, kebab].find((candidate) =>
    Object.prototype.hasOwnProperty.call(snapshot, candidate),
  )
  return found === undefined ? undefined : snapshot[found]
}

export type Relationship = 'holder' | 'dependent' | 'family-group'

export function relationshipOf(snapshot: unknown): Relationship | null {
  if (!isRecord(snapshot)) return null

  const memberType = read(snapshot, 'member_type')
  if (typeof memberType !== 'string' || memberType.trim() === '') return null
  // The EI compares its own member_type with EqualFold, so case is not stable.
  if (memberType.toLowerCase() === 'dependent') return 'dependent'

  // `omitempty` on the Go slice: a primary with none arrives without the key.
  const dependents = read(snapshot, 'dependents')
  return Array.isArray(dependents) && dependents.length > 0 ? 'family-group' : 'holder'
}
