// Sintaxe fast-redact: cada `*` casa exatamente um nível de propriedade, então
// precisamos de um caminho por profundidade — sem prefixo (raiz do objeto de
// log, ex.: `log.info({ email }, ...)`), com um `*.` (um nível de aninhamento)
// e com dois (`*.*.`) — para cobrir os formatos mais comuns sem exigir que
// quem loga saiba a sintaxe de redaction.
const PII_FIELDS = [
  'authorization',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'cpf',
  'email',
  'tax-id',
  'address',
]

export const PII_REDACT_PATHS: readonly string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  ...PII_FIELDS,
  ...PII_FIELDS.map((field) => `*.${field}`),
  ...PII_FIELDS.map((field) => `*.*.${field}`),
]
