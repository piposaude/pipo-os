import type { MaritalStatus, Person } from '@/lib/pipodesk/record'
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
  combined_change: 'Alteração combinada',
}

/** O tom do chip de classificação. Uma palavra nova sem entrada aqui cai em
 *  `neutral`, e o teste de contrato do vocabulário é o que a cobra. */
export const ENROLLMENT_TYPE_VARIANT: Record<string, 'neutral' | 'warning' | 'alert' | 'success'> =
  {
    inclusion: 'success',
    exclusion: 'alert',
    plan_change: 'warning',
    registration_data_change: 'neutral',
    // Carrega uma troca de plano, então lê com o mesmo tom.
    combined_change: 'warning',
  }

export const COMPANY_SIZE_COPY: Record<string, string> = {
  pme: 'PME',
  'pme-plus': 'PME+',
  enterprise: 'Empresarial',
}

export const MARITAL_STATUS_COPY: Record<MaritalStatus, string> = {
  single: 'Solteiro(a)',
  married: 'Casado(a)',
  divorced: 'Divorciado(a)',
  widowed: 'Viúvo(a)',
  'domestic-partnership': 'União estável',
}

/** The Backoffice label is "Sexo atribuído ao nascimento"; the values are these two. */
export const SEX_COPY: Record<Person['sex'], string> = {
  f: 'Feminino',
  m: 'Masculino',
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

/** A estrutura da empresa. Matriz é a estipulante, filial é a sub-estipulante;
 *  o par do contrato não entra no valor. */
export const COMPANY_STRUCTURE_COPY = {
  parent: 'Matriz',
  branch: (parentName: string) => `Filial de ${parentName}`,
}
