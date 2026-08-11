// Sintaxe fast-redact: cada `*` casa exatamente um nível de propriedade.
export const PII_REDACT_PATHS: readonly string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.authorization',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.apiKey',
  '*.cpf',
  '*.email',
  '*.*.password',
  '*.*.token',
  '*.*.cpf',
  '*.*.email',
]
