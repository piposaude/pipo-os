import type { DisplayStatus, PendingReason } from '@/lib/pipodesk/status'

/** Operations copy for the six display states. */
export const DISPLAY_STATUS_COPY: Record<DisplayStatus, string> = {
  'broker-processing': 'Com a Pipo',
  'carrier-processing': 'Na operadora',
  'client-pending': 'Com o cliente',
  'submitted-cancellation': 'Em cancelamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
}

/** Why it stalled, in operations voice. `internal-issue` is never announced
 *  to the client. */
export const PENDING_REASON_COPY: Record<PendingReason, string> = {
  'missing-documents': 'Falta documento',
  'incorrect-data': 'Dado incorreto',
  'internal-issue': 'Pendência interna',
}
