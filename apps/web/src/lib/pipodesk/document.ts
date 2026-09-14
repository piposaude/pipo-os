/** Each document the EI asks for. `spellings` are the EI's own — the key as
 *  `pendingDocumentation` writes it and the `kind` its files carry; `label` is copy. */
const DOCUMENTS = [
  { key: 'rg', label: 'RG', spellings: ['rg', 'RG'] },
  { key: 'cpf', label: 'CPF', spellings: ['cpf', 'CPF'] },
  {
    key: 'comprovante-residencia',
    label: 'comprovante de residência',
    spellings: ['comprovante-residencia', 'comprovante_residencia', 'Comprovante de residência'],
  },
] as const

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const KEY_BY_SPELLING = new Map<string, string>(
  DOCUMENTS.flatMap((doc) => doc.spellings.map((spelling) => [normalize(spelling), doc.key])),
)

const LABEL_BY_KEY = new Map<string, string>(DOCUMENTS.map((doc) => [doc.key, doc.label]))

/** Any EI spelling — a pendency key or a file's kind — to the one key that
 *  names the document. Unknowns keep their own normalised form, never a label. */
export const documentKey = (value: string): string =>
  KEY_BY_SPELLING.get(normalize(value)) ?? normalize(value)

export function documentLabel(key: string): string {
  const label = LABEL_BY_KEY.get(documentKey(key)) ?? key
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** Letters, digits and hyphens only: a file name has to survive Windows, email
 *  and a carrier's portal. */
const slug = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

/** `RG · Ana Souza · 700123`. A ticket that moves nobody falls back to kind and
 *  ticket: the identity it has, never a blank where the person would be. */
export function documentTitle(
  doc: { kind: string },
  ticketId: string,
  person: string | null,
): string {
  return [doc.kind, person, ticketId].filter((part) => part !== null).join(' · ')
}

/** The name the file would be born with: a carrier loses the signature
 *  validation when the file is renamed after export, so it cannot be a rename. */
export function downloadName(
  doc: { name: string; kind: string },
  ticketId: string,
  person: string | null,
): string {
  const dot = doc.name.lastIndexOf('.')
  const extension = dot === -1 ? '' : doc.name.slice(dot)
  return (
    [ticketId, person, doc.kind]
      .filter((part) => part !== null)
      .map((part) => slug(part))
      .join('-') + extension
  )
}

/** Documents grouped by kind, each group newest first: `versions.length > 1` is
 *  the back-and-forth — the first is current, the rest were superseded. */
export function versionsByKind<T extends { id: string; kind: string; at: string }>(
  docs: T[],
): { kind: string; versions: T[] }[] {
  // Grouped on the canonical key, never the raw spelling: two spellings of one
  // document are versions of it.
  const groups = new Map<string, T[]>()
  for (const doc of docs)
    groups.set(documentKey(doc.kind), [...(groups.get(documentKey(doc.kind)) ?? []), doc])
  return [...groups.values()].map((group) => {
    const versions = [...group].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
    // The spelling of the version that stands, not of whichever arrived first.
    return { kind: versions[0]!.kind, versions }
  })
}
