/**
 * The EI's words, stored as they arrive and translated only at the edge: out on
 * the way to the web client, back again when a filter comes in.
 */

const own = (map: Record<string, string>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(map, key)

interface Vocabulary {
  /** An unmapped value passes through, so a benefit we have no name for reaches
   *  the screen raw instead of empty. */
  toClient: (stored: string) => string
  /** A list and not one value: a client word may have more than one stored
   *  form, and matching only one of them would drop rows. */
  toStored: (clientValue: string) => string[]
}

const fromTable = (table: Record<string, string>): Vocabulary => ({
  toClient: (stored) => (own(table, stored) ? table[stored] : stored),
  toStored: (clientValue) => {
    const keys = Object.keys(table).filter((key) => table[key] === clientValue)
    return keys.includes(clientValue) ? keys : [...keys, clientValue]
  },
})

/** The EI names the same benefit twice — the short form of its Go payload
 *  (`health`) and the canonical Clojure one (`health-insurance`) — and either
 *  may be stored. A rule and not a table, so a benefit added over there needs
 *  no entry over here. */
const insuranceSuffix: Vocabulary = {
  toClient: (stored) => stored.replace(/-insurance$/, ''),
  toStored: (clientValue) =>
    clientValue.endsWith('-insurance') ? [clientValue] : [clientValue, `${clientValue}-insurance`],
}

export const VOCABULARIES = {
  companySize: fromTable({ smb: 'pme', 'smb-plus': 'pme-plus', corporate: 'enterprise' }),
  contractType: fromTable({ 'brazil-labor-law': 'clt', 'services-contract': 'pj' }),
  product: insuranceSuffix,
} as const

export type VocabularyName = keyof typeof VOCABULARIES

export function toClient(name: VocabularyName, stored: string | null): string | null {
  return stored === null ? null : VOCABULARIES[name].toClient(stored)
}

export function toStored(name: VocabularyName, clientValue: string): string[] {
  return VOCABULARIES[name].toStored(clientValue)
}
