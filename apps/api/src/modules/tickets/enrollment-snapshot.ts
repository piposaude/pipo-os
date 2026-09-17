/**
 * The only module on this side that knows the enrollment_snapshot shape. Reads
 * raw: the column stores the EI's own word and `vocabulary.ts` translates at
 * the edge. A bridge until the EI sends the fields in the body (PD-207).
 */

import { sql, type RawBuilder } from 'kysely'
import { z } from 'zod'
import type { relationshipSchema } from './schemas.js'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const camelOf = (key: string): string =>
  key.replace(/[-_]([a-z])/g, (_, letter: string) => letter.toUpperCase())

const snakeOf = (key: string): string => key.replace(/-/g, '_')

const kebabOf = (key: string): string => key.replace(/_/g, '-')

/** The spellings a key may arrive in, in the order the web tries them. */
const spellingsOf = (key: string): string[] => [
  ...new Set([key, camelOf(key), snakeOf(key), kebabOf(key)]),
]

/** The snapshot contract is not frozen (PD-001), so a separator must not
 *  decide whether a column is filled. Twin of `readPath` in web's ticket-row. */
function readPath(snapshot: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = snapshot
  for (const segment of path) {
    if (!isRecord(current)) return undefined
    const source = current
    const key = spellingsOf(segment).find((candidate) =>
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

/** The EI's `alteration_type` as written — a number as much as a word, because
 *  a value we cannot read is still an answer, and it earns a different 422 from
 *  silence. A blank is silence. Judging it belongs to `enrollment-type.ts`. */
export function alterationTypeOf(snapshot: unknown): unknown {
  if (!isRecord(snapshot)) return null
  const written = readPath(snapshot, ['alteration-type'])
  if (written === undefined || (typeof written === 'string' && written.trim() === '')) return null
  return written
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

export interface CompanyFields {
  /** The parent company, `null` when this one already is the parent. The key
   *  the queue filters and groups by (DSP-36). */
  parentCompanyId: string | null
  parentCompanyName: string | null
  /** The company's CNPJ — the beneficiary's CPF is `tax_id`, another column. */
  companyTaxId: string | null
}

const NO_COMPANY: CompanyFields = {
  parentCompanyId: null,
  parentCompanyName: null,
  companyTaxId: null,
}

/**
 * Whether the company of the movement is a branch, by the same rule the EI
 * uses in `hasParentCompany` (zendesk/alteration_template.go): the flag when
 * it is there, the two tax ids when it is not.
 *
 * It matters because the EI fills `parent_company_*` for a parent company as
 * well — reading them without this would make every company a branch of
 * itself, and the Empresa cell would read `Meridiano › Meridiano`.
 */
function isBranch(company: Record<string, unknown>): boolean {
  const flag = readPath(company, ['company-subsidiary'])
  // Only a JSON boolean answers: the string "true" is not the EI's flag, and
  // taking it for one would flip a parent company into a branch.
  if (typeof flag === 'boolean') return flag

  const parentTaxId = readString(company, ['parent-company-tax-id'])
  return parentTaxId !== null && parentTaxId !== readString(company, ['company-tax-id'])
}

/** The column is `uuid` and the EI types the field as a bare string, so an id
 *  Postgres cannot parse would turn a ticket that should exist into a 500 on
 *  creation. A parent nobody can resolve is no parent. */
const uuidOrNull = (value: string | null): string | null =>
  value !== null && z.uuid().safeParse(value).success ? value : null

/**
 * The company columns of the row, frozen at creation like the movement ones.
 * The CNPJ is read for every ticket — it is what tells apart two companies
 * sharing a trade name — while the parent only survives `isBranch`.
 *
 * The parent is a pair, written together or not at all: with a name and no id
 * the queue would group by the branch and label every one of those groups with
 * the parent's name, while a filter by the parent reached none of them.
 */
export function companyFieldsOf(snapshot: unknown): CompanyFields {
  if (!isRecord(snapshot)) return NO_COMPANY

  const company = readPath(snapshot, ['company'])
  if (!isRecord(company)) return NO_COMPANY

  const companyTaxId = readString(company, ['company-tax-id'])
  if (!isBranch(company)) return { ...NO_COMPANY, companyTaxId }

  const parentCompanyId = uuidOrNull(readString(company, ['parent-company-id']))
  if (parentCompanyId === null) return { ...NO_COMPANY, companyTaxId }

  return {
    parentCompanyId,
    parentCompanyName: readString(company, ['parent-company-name']),
    companyTaxId,
  }
}

/**
 * The first key under `parent` that holds a real word, mirroring the web's
 * `readString` in `ticket-row.ts` — the queue has to read the snapshot the
 * same way on both sides or the number a node announces stops matching the
 * list the screen draws.
 *
 * Pass the keys the web passes: each expands to the spellings `readPath`
 * accepts. Only the leaf expands — every parent in use is a single word.
 *
 * Two rules that `coalesce` alone would miss, and each one is a divergence
 * the web does not have:
 *   - a blank counts as absent, so `company-name: ''` falls through to `name`;
 *   - only a JSON string counts, so a number does not become `"42"` here
 *     while the web reads it as nothing.
 */
export function snapshotString(parent: string[], keys: string[]): RawBuilder<string | null> {
  const candidates = keys.flatMap(spellingsOf).map((key) => {
    /* `array[...]` of literals, not a `'{a,b}'` string built by concatenation:
       the segments are constants today, and this keeps a future caller from
       turning a key with a comma or a brace into a different path. */
    const path = sql`array[${sql.join([...parent, key].map(sql.lit), sql`, `)}]`
    return sql`nullif(btrim(case when jsonb_typeof(enrollment_snapshot #> ${path}) = 'string'
                                 then enrollment_snapshot #>> ${path} end), '')`
  })
  return sql<string | null>`coalesce(${sql.join(candidates, sql`, `)})`
}
