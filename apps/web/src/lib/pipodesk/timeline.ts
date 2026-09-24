import { DISPLAY_STATUS_COPY, PENDING_REASON_COPY } from '@/constants/pipodesk/status'
import type { components } from '@pipo-os/api-client'
import { ENROLLMENT_TYPE_COPY, PRIORITY_COPY } from '@/constants/pipodesk/domain'
import { isApiStatus, toDisplayStatus } from './status'
import { isPriority, type TicketRow } from './ticket-row'

type TimelineItem = components['schemas']['TimelineItem']

export type CommentChannel = 'internal' | 'public' | 'email'

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

export interface ChannelOption {
  /** The composer button. Deliberately not `CHANNEL_LABEL`: the timeline chip
   *  says `E-mail`, the button that sends one says `E-mail ao RH`. */
  label: string
  hint: string
  /** Parked channels take no click and cannot become the active channel, so
   *  the flag lives here instead of as a comparison against the name at each
   *  of the four places that used to ask "is this the e-mail one?". */
  parked?: true
}

/**
 * Composer channels, keyed rather than listed: a `Record` is what lets the
 * compiler demand an entry per `CommentChannel`, and it removes the
 * `find(…)!` that a lookup by value needed. Insertion order is the button
 * order — internal note first, faithful to Zendesk.
 */
export const CHANNELS: Record<CommentChannel, ChannelOption> = {
  internal: {
    label: 'Anotação interna',
    hint: 'Só a operação vê. É onde a coordenação entre analistas acontece.',
  },
  public: {
    label: 'Comentário público',
    hint: 'O RH vê na plataforma.',
  },
  email: {
    label: 'E-mail ao RH',
    hint: 'Sai da plataforma, e entra nesta mesma linha do tempo.',
    /** Phase 6 (PD-112): the backend answers 501 until then, and faking the
     *  send would teach a gesture that does not exist. */
    parked: true,
  },
}

/** The channels in button order, provably complete by the record above. */
export const CHANNEL_ORDER: readonly CommentChannel[] = Object.keys(CHANNELS) as CommentChannel[]

const SYSTEM = 'Sistema'

function statusLabel(status: string): string {
  if (!isApiStatus(status)) return status
  const { status: display, reason } = toDisplayStatus(status)
  return reason
    ? `${DISPLAY_STATUS_COPY[display]} · ${PENDING_REASON_COPY[reason]}`
    : DISPLAY_STATUS_COPY[display]
}

function eventBody(
  item: Extract<TimelineItem, { type: 'event' }>,
  resolveName: (userId: string) => string,
): string {
  const { assigneeId, priority } = item.metadata
  if (item.eventType === 'assigned' && typeof assigneeId === 'string') {
    return `${item.body}: ${resolveName(assigneeId)}`
  }
  if (
    item.eventType === 'priority_changed' &&
    typeof priority === 'string' &&
    isPriority(priority)
  ) {
    return `${item.body}: ${PRIORITY_COPY[priority]}`
  }
  return item.body
}

function channelOf(item: Extract<TimelineItem, { type: 'comment' }>): CommentChannel {
  if (item.channel === 'email') return 'email'
  return item.visibility === 'public' ? 'public' : 'internal'
}

export function timelineFromApi(
  ticket: TicketRow,
  items: TimelineItem[],
  resolveName: (userId: string) => string,
): TimelineEvent[] {
  const created: TimelineEvent = {
    id: `${ticket.id}-created`,
    at: ticket.createdAt,
    actor: SYSTEM,
    body: `Chamado criado a partir de uma movimentação de ${
      ENROLLMENT_TYPE_COPY[ticket.enrollmentType] ?? ticket.enrollmentType
    }${ticket.companyName ? ` da ${ticket.companyName}` : ''}.`,
  }

  return [
    created,
    ...items.flatMap((item): TimelineEvent[] => {
      const actor =
        item.authorType === 'user' && item.authorId ? resolveName(item.authorId) : SYSTEM
      switch (item.type) {
        case 'comment':
          return [
            {
              id: item.id,
              at: item.createdAt,
              actor,
              body: item.body,
              channel: channelOf(item),
            },
          ]
        case 'event':
          return [{ id: item.id, at: item.createdAt, actor, body: eventBody(item, resolveName) }]
        case 'status-changed':
          return [
            {
              id: item.id,
              at: item.createdAt,
              actor,
              body: `Situação mudou de ${statusLabel(item.fromStatus)} para ${statusLabel(item.toStatus)}.`,
            },
          ]
        default:
          return []
      }
    }),
  ]
}

export function commentBodyOf(
  channel: Exclude<CommentChannel, 'email'>,
  body: string,
): { kind: 'manual'; visibility: 'public' | 'private'; body: string } {
  return { kind: 'manual', visibility: channel === 'public' ? 'public' : 'private', body }
}
