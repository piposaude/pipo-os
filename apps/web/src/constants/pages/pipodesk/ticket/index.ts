import type { CommentChannel } from '@/lib/pipodesk/timeline'

export default {
  notFound: (id: string) => `Não existe chamado com o id ${id}.`,
  copyId: (id: string) => `Copiar o ID ${id}`,
  copied: 'Copiado',
  copyGlyph: '⧉',
  /** Two parts, as in the prototype: the fact carries the weight, the filed
   *  date follows in plain text — no period between them. */
  overdueLead: (days: number) =>
    `Movimentação está atrasada em ${days} ${days === 1 ? 'dia' : 'dias'}`,
  overdueDate: (date: string) => `Registrada para ${date}.`,
  tabs: {
    movimentacao: 'Movimentação',
    pessoa: 'Dados pessoais',
    empresa: 'Sobre a empresa',
    documentos: 'Documentos',
    historico: 'Histórico',
  },
  /** The four record tabs read the full EI snapshot — they arrive with PD-111. */
  tabPending:
    'Esta aba lê o retrato completo da movimentação (snapshot do EI), que chega com o PD-111.',
  facts: {
    heading: 'Movimentação',
    company: 'Empresa',
    carrier: 'Operadora',
    product: 'Produto',
    type: 'Tipo',
    contract: 'Contrato',
    relationship: 'Vínculo',
    companySize: 'Porte',
    actionDate: 'Data de ação',
    createdAt: 'Aberto em',
    origin: 'Origem',
  },
  context: {
    region: 'Contexto do chamado',
    /** What a screen reader announces on an editable pill: the field, its
     *  current value, and that it opens. Copy, so it lives here. */
    changeLabel: (field: string, value: string) => `${field}: ${value}. Trocar`,
    properties: 'Propriedades',
    situation: 'Situação',
    priority: 'Prioridade',
    noAnalysts: 'Este pod não tem analista para receber o chamado.',
    noPriority: 'Sem prioridade',
    owner: 'Dono',
    free: 'Livre no pod',
    removeAssignment: 'Remover atribuição',
  },
  timeline: {
    heading: 'Linha do tempo',
    channelGroup: 'Canal do comentário',
    /** The field's accessible name — a placeholder is not one. */
    label: {
      internal: 'Anotação interna',
      public: 'Comentário público',
      email: 'E-mail ao RH',
    } satisfies Record<CommentChannel, string>,
    /** Keyed by channel, not `x` plus `xEmail`: the pair of ternaries this
     *  replaced could only ever pick the non-e-mail side, because the parked
     *  channel never becomes the active one. */
    placeholder: {
      internal: 'Escreva…',
      public: 'Escreva…',
      email: 'Escreva o e-mail ao RH…',
    } satisfies Record<CommentChannel, string>,
    submit: {
      internal: 'Comentar',
      public: 'Comentar',
      email: 'Enviar e-mail',
    } satisfies Record<CommentChannel, string>,
    /** E-mail is Phase 6 (PD-112): the backend answers 501 until then, and
     *  faking the send would teach a gesture that does not exist. */
    emailPending: 'O e-mail ao RH chega com a Fase 6 (PD-112).',
    now: 'agora',
  },
}
