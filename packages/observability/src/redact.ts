/* Only ever sees the logger's first argument. An interpolated message is never
 * redacted — hence the README rule to pass data, not build a string. */

/** Roots in camelCase; each expands to kebab and snake below. */
const PII_FIELD_ROOTS = [
  'authorization',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'cpf',
  'email',
  // The JWT subject. In Pipo's tokens it is the person's e-mail, so leaving it
  // out would redact `email` and publish the same value under another name.
  'sub',
  'taxId',
  'address',
  'beneficiaryName',
  // The ticket subject ends in the beneficiary name (ACE-226).
  'title',
] as const

/** What every redaction writes in place of the value, here so the query string
 *  and pino's own censor cannot drift into two spellings. */
export const REDACTED = '[REDACTED]'

/** Query parameters whose value is typed by a person, so it carries whoever
 *  they are searching for. `req.url` is logged whole, and pino cannot reach in. */
export const PII_QUERY_PARAMS: readonly string[] = ['subjectQuery', 'search']

/** Redacted whole — free-form jsonb with no closed shape (PD-001). */
const PII_OBJECT_ROOTS = ['enrollmentSnapshot', 'requester', 'collaborators'] as const

/** Exported for their own tests: these produce the coverage. */
export const kebabOf = (root: string): string =>
  root.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
export const snakeOf = (root: string): string =>
  root.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

// A single-word root yields three identical spellings; the Set collapses them.
const PII_FIELDS = [
  ...new Set(
    [...PII_FIELD_ROOTS, ...PII_OBJECT_ROOTS].flatMap((root) => [
      root,
      kebabOf(root),
      snakeOf(root),
    ]),
  ),
]

/** Covers the root and two nestings; deeper leaks. Pinned by a test — a fourth
 *  level costs ~20 µs more per log line (measured, ACE-196). */
const MAX_DEPTH = 3

const nested = (depth: number): string[] =>
  PII_FIELDS.map((field) => `${'*.'.repeat(depth)}${field}`)

export const PII_REDACT_PATHS: readonly string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  ...Array.from({ length: MAX_DEPTH }, (_, depth) => nested(depth)).flat(),
]
