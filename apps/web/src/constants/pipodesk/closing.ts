export const CLOSING_FIELD_COPY = {
  card: 'Carteirinha',
  start: 'Início da vigência',
  end: 'Data de fim da vigência',
  effective: 'Nova data de vigência',
}

export const CLOSING_MISSING_COPY = {
  empty: (labels: string[]) => `${labels.length === 1 ? 'Falta' : 'Faltam'} ${labels.join(', ')}`,
  early: (labels: string[]) => `${labels.join(', ')} antes de um mês da admissão`,
  cpfTail: (name: string, tail: string) => `${name} (CPF ${tail})`,
}
