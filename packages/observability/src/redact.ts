// As raízes, em camelCase. A lista antiga misturava grafias — tinha `tax-id`
// enquanto o contrato da API devolve `taxId` — e a grafia escolhida por quem
// escreveu a lista decidia se o campo era redigido ou não. Aqui cada raiz gera
// as três grafias que aparecem no repositório, então quem loga não precisa
// acertar a mesma que o autor da lista usou.
const PII_ROOTS = [
  'authorization',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'cpf',
  'email',
  'taxId',
  'address',
  'beneficiaryName',
  'birthDate',
  // Objetos inteiros, não campo a campo: a forma do snapshot não é contrato
  // fechado (o readPath de enrollment-snapshot.ts existe porque a grafia varia),
  // e requester/collaborators guardam pessoa em jsonb livre. Redigir o objeto é
  // a única regra que não envelhece junto com o payload do EI.
  'enrollmentSnapshot',
  'requester',
  'collaborators',
] as const

const kebabOf = (root: string): string => root.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
const snakeOf = (root: string): string => root.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

// Uma raiz de palavra única gera as três grafias iguais; o Set as colapsa.
const PII_FIELDS = [...new Set(PII_ROOTS.flatMap((root) => [root, kebabOf(root), snakeOf(root)]))]

// Sintaxe fast-redact: cada `*` casa exatamente um nível de propriedade, então
// precisamos de um caminho por profundidade — sem prefixo (raiz do objeto de
// log, ex.: `log.info({ email }, ...)`), com um `*.` (um nível de aninhamento)
// e com dois (`*.*.`) — para cobrir os formatos mais comuns sem exigir que
// quem loga saiba a sintaxe de redaction.
export const PII_REDACT_PATHS: readonly string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  ...PII_FIELDS,
  ...PII_FIELDS.map((field) => `*.${field}`),
  ...PII_FIELDS.map((field) => `*.*.${field}`),
]
