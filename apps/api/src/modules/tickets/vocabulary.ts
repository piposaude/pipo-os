/**
 * The EI's words, stored as they arrive and translated only at the edge: out on
 * the way to the web client, back again when a filter comes in.
 */
const COMPANY_SIZE: Record<string, string> = {
  smb: 'pme',
  'smb-plus': 'pme-plus',
  corporate: 'enterprise',
}

const CONTRACT_TYPE: Record<string, string> = {
  'brazil-labor-law': 'clt',
  'services-contract': 'pj',
}

/** The EI takes both the short form of its Go payload (`health`) and the
 *  canonical Clojure one (`health-insurance`), so either may be stored. */
const PRODUCT: Record<string, string> = {
  'health-insurance': 'health',
  'dental-insurance': 'dental',
  'life-insurance': 'life',
  'pet-insurance': 'pet',
}

export const VOCABULARIES = {
  companySize: COMPANY_SIZE,
  contractType: CONTRACT_TYPE,
  product: PRODUCT,
} as const

export type VocabularyName = keyof typeof VOCABULARIES

const own = (map: Record<string, string>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(map, key)

/** An unmapped value passes through, so a benefit we have no name for reaches
 *  the screen raw instead of empty. */
export function toClient(name: VocabularyName, stored: string | null): string | null {
  if (stored === null) return null
  const map = VOCABULARIES[name]
  return own(map, stored) ? map[stored] : stored
}

/** A list and not one value: `health` has to find both `health` and
 *  `health-insurance`, since the EI may have stored either. */
export function toStored(name: VocabularyName, clientValue: string): string[] {
  const map = VOCABULARIES[name]
  const keys = Object.keys(map).filter((key) => map[key] === clientValue)
  return keys.includes(clientValue) ? keys : [...keys, clientValue]
}
