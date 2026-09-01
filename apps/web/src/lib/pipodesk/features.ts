/**
 * Pipodesk flags — the placeholder mechanism of the front-first track. What
 * depends on an unwritten endpoint ships behind a flag: surface built, control
 * disabled, tooltip naming the ticket that turns it on. No screen knows a
 * neighbor's flag.
 */

export const FEATURES = {
  /** Unified timeline and comment composer. */
  timeline: false,
  /** Completion form from the API (deprioritized: D13 fixed rules in code). */
  formValues: false,
  /** Completion gates before closing. */
  gates: false,
  /** Ticket priority. */
  priority: false,
  /** Scheduling (action date) and the future-moves node. */
  schedule: false,
  /** Batch actions. */
  batch: false,
  /** Busca global ⌘K. */
  search: false,
  /** Inbox: what arrived from HR in the last 24h. */
  inbox: false,
  /** Favoritar uma view. */
  favorites: false,
  /** Nome, avatar e papel das pessoas. */
  users: false,
  /** Add/remove pod member. */
  members: false,
  /** Pod hierarchy and company portfolio. */
  portfolio: false,
} as const satisfies Record<string, boolean>

export type FeatureFlag = keyof typeof FEATURES

/** The ticket that turns each flag on. Kept next to the flag: a disabled
 *  control that cannot explain itself is a dead button. */
export const BLOCKED_BY: Record<FeatureFlag, string> = {
  timeline: 'PD-040 (comentários) e PD-041 (timeline)',
  formValues: 'PD-034 (despriorizado em 31/08 — D13)',
  gates: 'PD-031 (gates de conclusão)',
  priority: 'PD-036 (prioridade na API)',
  schedule: 'PD-036 (agendamento na API)',
  batch: 'PD-042 (lote na API)',
  search: 'PD-080 (busca no servidor)',
  inbox: 'PD-080 (inbox no servidor)',
  favorites: 'PD-053 (favoritos na fila salva)',
  users: 'PD-060 (módulo de usuários)',
  members: 'PD-010 dissolvido — a coluna de identidade entra com PD-050',
  portfolio: 'PD-050 e PD-051 (hierarquia e carteira)',
}

export const isEnabled = (flag: FeatureFlag): boolean => FEATURES[flag]

/** Tooltip for a disabled control. */
export const pendingHint = (flag: FeatureFlag): string =>
  `Em breve — depende de ${BLOCKED_BY[flag]}`
