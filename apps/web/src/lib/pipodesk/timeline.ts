/**
 * Ticket timeline. Automated events do not exist yet (PD-040/041); until then
 * the timeline is derived from the row itself (created/assigned/scheduled/
 * status) plus session comments. Event shape matches the PD-041 UNION, so
 * swapping the source will not change the screen.
 */

import { DISPLAY_STATUS_COPY, PENDING_REASON_COPY } from '@/constants/pipodesk/status'
import { ENROLLMENT_TYPE_COPY } from '@/constants/pipodesk/domain'
import type { TicketRow } from './ticket-row'

export type CommentChannel = 'internal' | 'public' | 'email'

export interface TicketComment {
  id: string
  ticketId: string
  channel: CommentChannel
  body: string
  at: string
  author: string
}

export interface TimelineEvent {
  id: string
  at: string
  /** Who did it: a person's name, or `Sistema` for automation. */
  actor: string
  body: string
  channel?: CommentChannel
}

export const CHANNEL_LABEL: Record<CommentChannel, string> = {
  internal: 'Anotação interna',
  public: 'Comentário público',
  email: 'E-mail',
}

/** Composer channels. Default is the internal note, faithful to Zendesk. */
export const CHANNELS: { value: CommentChannel; label: string; hint: string }[] = [
  {
    value: 'internal',
    label: 'Anotação interna',
    hint: 'Só a operação vê. É onde a coordenação entre analistas acontece.',
  },
  {
    value: 'public',
    label: 'Comentário público',
    hint: 'O RH vê na plataforma.',
  },
  {
    value: 'email',
    label: 'E-mail ao RH',
    hint: 'Sai da plataforma, e entra nesta mesma linha do tempo.',
  },
]

const plusHours = (iso: string, hours: number): string =>
  new Date(Date.parse(iso) + hours * 3_600_000).toISOString()

export function timelineOf(
  ticket: TicketRow,
  comments: TicketComment[],
  resolveName: (userId: string) => string,
): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      id: `${ticket.id}-created`,
      at: ticket.createdAt,
      actor: 'Sistema',
      body: `Chamado criado a partir de uma movimentação de ${
        ENROLLMENT_TYPE_COPY[ticket.enrollmentType] ?? ticket.enrollmentType
      }${ticket.companyName ? ` da ${ticket.companyName}` : ''}.`,
    },
  ]

  if (ticket.assigneeId !== null) {
    events.push({
      id: `${ticket.id}-assigned`,
      at: plusHours(ticket.createdAt, 1),
      actor: 'Sistema',
      body: `Atribuído a ${resolveName(ticket.assigneeId)} pela carteira da empresa.`,
    })
  }

  if (ticket.actionDate !== null) {
    events.push({
      id: `${ticket.id}-scheduled`,
      at: plusHours(ticket.createdAt, 2),
      actor: 'Sistema',
      body: `Movimentação registrada para ${ticket.actionDate.split('-').reverse().join('/')}.`,
    })
  }

  if (ticket.status !== 'broker-processing') {
    const display = DISPLAY_STATUS_COPY[ticket.display]
    const reason = ticket.reason ? ` · ${PENDING_REASON_COPY[ticket.reason]}` : ''
    events.push({
      id: `${ticket.id}-status`,
      at: ticket.updatedAt,
      actor: 'Sistema',
      body: `Situação mudou para ${display}${reason}.`,
    })
  }

  for (const comment of comments) {
    if (comment.ticketId !== ticket.id) continue
    events.push({
      id: comment.id,
      at: comment.at,
      actor: resolveName(comment.author),
      body: comment.body,
      channel: comment.channel,
    })
  }

  return events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
}
