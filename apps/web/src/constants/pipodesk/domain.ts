/** pt-BR copy for domain values from the snapshot. Missing keys fall back to
 *  the raw value — EI may ship a product before the UI learns its name. */
export const PRODUCT_COPY: Record<string, string> = {
  health: 'Saúde',
  dental: 'Odonto',
  life: 'Vida',
  pharmacy: 'Farmácia',
  gym: 'Academia',
  pet: 'Pet',
}

export const ENROLLMENT_TYPE_COPY: Record<string, string> = {
  inclusion: 'Inclusão',
  exclusion: 'Exclusão',
  plan_change: 'Alteração',
  registration_data_change: 'Alteração cadastral',
}

export const PORTE_COPY: Record<string, string> = {
  pme: 'PME',
  'pme-plus': 'PME+',
  enterprise: 'Empresarial',
}

export const VINCULO_COPY: Record<string, string> = {
  titular: 'Titular',
  dependente: 'Dependente',
  'grupo-familiar': 'G. Familiar',
}

export const PRIORITY_COPY: Record<string, string> = {
  urgent: 'Urgente',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
}

export default { PRODUCT_COPY, ENROLLMENT_TYPE_COPY, PORTE_COPY, VINCULO_COPY, PRIORITY_COPY }
