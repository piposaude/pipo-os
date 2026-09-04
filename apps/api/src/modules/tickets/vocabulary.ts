const own = (map: Record<string, string>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(map, key)

interface Vocabulary {
  /** An unmapped value passes through, so a benefit we have no name for reaches
   *  the screen raw instead of empty. */
  toClient: (stored: string) => string
  /** A list and not one value: a client word may have more than one stored
   *  form, and matching only one of them would drop rows. */
  toStored: (clientValue: string) => string[]
  /** `null` when the de-para is a rule and the set is open. Declared in
   *  contract/ticket-vocabulary.json so the web is held to having copy. */
  clientWords: string[] | null
}

const fromTable = (table: Record<string, string>): Vocabulary => ({
  clientWords: [...new Set(Object.values(table))],
  toClient: (stored) => (own(table, stored) ? table[stored] : stored),
  toStored: (clientValue) => {
    const keys = Object.keys(table).filter((key) => table[key] === clientValue)
    // A stored word that has a translation never reaches the client as itself,
    // so it is not a client word: matching it here would find rows the web
    // cannot. An unmapped value passes through, as in toClient.
    return own(table, clientValue) ? keys : [...keys, clientValue]
  },
})

/** The EI names the same benefit twice, the short form of its Go payload
 *  (`health`) and the canonical Clojure one (`health-insurance`), and either
 *  may be stored. */
const insuranceSuffix: Vocabulary = {
  clientWords: null,
  toClient: (stored) => stored.replace(/-insurance$/, ''),
  // The client never sees the suffix, so a value carrying it is not a client word.
  toStored: (clientValue) =>
    clientValue.endsWith('-insurance') ? [] : [clientValue, `${clientValue}-insurance`],
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
