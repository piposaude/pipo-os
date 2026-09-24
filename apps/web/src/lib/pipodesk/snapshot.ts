/**
 * The ONLY module that knows the `enrollmentSnapshot` shape (decision D4) —
 * a snapshot contract change (RFC PD-001) costs one file, not the whole desk.
 */

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** `member-type` (how EI serializes today) and `memberType` are the same key. */
const camelOf = (key: string): string =>
  key.replace(/[-_]([a-z])/g, (_, letter: string) => letter.toUpperCase())

const snakeOf = (key: string): string => key.replace(/[-]/g, '_')

/**
 * Reads a snapshot path accepting kebab/snake/camelCase per segment. The
 * contract is not frozen yet (RFC PD-001); a hyphen must not blank the queue.
 */
function readPath(source: unknown, path: string[]): unknown {
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

function readString(source: unknown, ...paths: string[][]): string | null {
  for (const path of paths) {
    const value = readPath(source, path)
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return null
}

export interface SnapshotHeadline {
  beneficiaryName: string | null
  taxId: string | null
  companyName: string | null
}

export function snapshotHeadline(snapshot: unknown): SnapshotHeadline {
  return {
    beneficiaryName: readString(
      snapshot,
      ['primary', 'profile', 'preferred-name'],
      ['primary', 'profile', 'name'],
    ),
    taxId: readString(snapshot, ['primary', 'profile', 'tax-id']),
    companyName: readString(snapshot, ['company', 'company-name'], ['company', 'name']),
  }
}
