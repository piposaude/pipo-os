import { ENROLLMENT_TYPE_COPY } from '@/constants/pipodesk/domain'
import type { CompletionBlock } from '@/lib/pipodesk/closing'
import type { Destination } from '@/lib/pipodesk/composer'

export default {
  notFound: (id: string) => `Não existe chamado com o id ${id}.`,
  loadFailed: (id: string) => `Não foi possível carregar o chamado ${id}.`,
  copyId: (id: string) => `Copiar o ID ${id}`,
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
  facts: {
    heading: 'Movimentação',
    branchNotice: (type: string) => `${ENROLLMENT_TYPE_COPY[type] ?? type} na filial:`,
    company: 'Empresa',
    /* Matriz is the estipulante and filial the sub-estipulante; on a branch
       ticket the two labels carry the structure and `structure` drops out. */
    parentCompany: 'Matriz',
    branchCompany: 'Filial',
    cnpj: 'CNPJ',
    structure: 'Estrutura',
    isParent: 'Matriz',
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
    actionDate: 'Data de ação',
    noActionDate: 'Sem data de ação. Agendar movimentação',
  },
  timeline: {
    heading: 'Linha do tempo',
    loadFailed: 'Não foi possível carregar a linha do tempo.',
    now: 'agora',
  },
  composer: {
    destinationsLabel: 'Este texto vai para',
    destination: {
      internal: 'Interno',
      platform: 'Plataforma do RH',
      email: 'E-mail para o RH',
    } satisfies Record<Destination, string>,
    hint: {
      internal: 'Não sai do chamado.',
      platform: 'Vira a última atualização que o RH vê na plataforma.',
    },
    emailParked: 'O e-mail ao RH chega com a Fase 6 (PD-112).',
    split: {
      open: 'Escrever diferente para cada um',
      close: 'Voltar a um texto só',
      needsTwo: 'Só faz sentido com mais de um destino ligado',
      openHint: 'Abre uma caixa por destino, quando o mesmo texto não serve para todos',
      closeHint: 'Volta a um texto só. Os textos por destino ficam guardados até você reabrir.',
    },
    field: 'Escrever uma mensagem',
    placeholder: 'Escrever…',
    fieldFor: (destination: string) => `Texto para ${destination}`,
    placeholderFor: (destination: string) => `Escrever para ${destination.toLowerCase()}…`,
    submitAs: (situation: string) => `Enviar como ${situation}`,
    changeStatus: (situation: string) => `Enviar como ${situation}. Trocar a situação`,
    statusMenu: 'Situação do envio',
    closed: (situation: string) => `${situation} não reabre. O envio entra como registro.`,
    completionBlocked: {
      status: 'Só conclui a partir de Na operadora, Com o cliente ou Pendência interna.',
      lives: 'O chamado não identifica pelo CPF todas as vidas da movimentação.',
    } satisfies Record<CompletionBlock, string>,
    sendFailed: 'O envio não foi salvo.',
  },
  conclusion: {
    title: 'Concluir movimentação',
    note: 'O que a operadora efetivou — a data solicitada na abertura fica ao lado, para comparar. Nada é gravado aqui: quem conclui é o',
    noteAction: 'Enviar como Concluída',
    group: 'Dados da conclusão',
    life: (role: 'holder' | 'dependent', admission: string | null) =>
      `${role === 'holder' ? 'Titular' : 'Dependente'}${admission ? ` · admissão ${admission}` : ''}`,
    cardPlaceholder: 'Número na operadora',
    floor: (date: string) => `A partir de ${date} — um mês antes da admissão`,
    requested: (date: string) => `solicitada ${date}`,
    allFilled: 'Tudo preenchido · o envio conclui o chamado',
    back: 'Voltar ao envio',
    summary: 'Dados da conclusão',
    filled: (done: number, total: number) => `· ${done} de ${total} preenchidos`,
    fill: 'Preencher',
    review: 'Revisar',
    rejected: {
      required: 'Este campo é obrigatório para concluir.',
      invalid: 'Esta data não existe.',
      before_admission: 'Antes de um mês da admissão.',
    } as Record<string, string>,
    rejectedOther: 'A API recusou este valor.',
  },
}
