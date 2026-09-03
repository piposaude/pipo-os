import type { Priority } from '@/lib/pipodesk/ticket-row'
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

export const COMPANY_SIZE_COPY: Record<string, string> = {
  pme: 'PME',
  'pme-plus': 'PME+',
  enterprise: 'Empresarial',
}

export const RELATIONSHIP_COPY: Record<string, string> = {
  holder: 'Titular',
  dependent: 'Dependente',
  'family-group': 'G. Familiar',
}

/** `Record<Priority, …>`, não `Record<string, …>`: uma prioridade nova sem
 *  entrada aqui passa a ser erro de compilação, não rótulo vazio. */
export const PRIORITY_COPY: Record<Priority, string> = {
  urgent: 'Urgente',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
}
