export default {
  notFound: (id: string) => `Não existe chamado com o id ${id}.`,
  copyId: (id: string) => `Copiar o ID ${id}`,
  copied: 'Copiado',
  overdue: (days: number, date: string) =>
    `Movimentação está atrasada em ${days} ${days === 1 ? 'dia' : 'dias'}. Registrada para ${date}.`,
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
    vinculo: 'Vínculo',
    porte: 'Porte',
    actionDate: 'Data de ação',
    createdAt: 'Aberto em',
    origin: 'Origem',
  },
  context: {
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
    placeholder: 'Escreva…',
    placeholderEmail: 'Escreva o e-mail ao RH…',
    submit: 'Comentar',
    submitEmail: 'Enviar e-mail',
    /** E-mail is Phase 6 (PD-112): the backend answers 501 until then, and
     *  faking the send would teach a gesture that does not exist. */
    emailPending: 'O e-mail ao RH chega com a Fase 6 (PD-112).',
    now: 'agora',
  },
}
