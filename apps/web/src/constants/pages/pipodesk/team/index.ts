import { formatCount } from '@/lib/pipodesk/format'

export default {
  open: (count: number) =>
    `${formatCount(count)} ${count === 1 ? 'chamado aberto' : 'chamados abertos'}`,
  truncated: (shown: number, total: number) =>
    `Mostrando um recorte: ${formatCount(shown)} de ${formatCount(total)} chamados. As contagens deste time valem só para o que está aqui.`,
  unowned: {
    label: 'Empresas sem dono',
    title: (companies: number, tickets: number) =>
      `${companies} ${companies === 1 ? 'empresa sem dono' : 'empresas sem dono'} · ${tickets} ${
        tickets === 1 ? 'chamado' : 'chamados'
      }`,
    /* Speaks of work arriving by rotation, not of orphan tickets: with rotation
           on, the tickets have owners — the company does not. */
    body: 'Enquanto não tiverem dono, o trabalho delas chega por rodízio — a quem estiver na vez, não a quem conhece o cliente.',
  },
  table: {
    person: 'Pessoa',
    role: 'Papel',
    pod: 'Pod',
    portfolio: 'Carteira',
    open: 'Abertos',
    actions: 'Ações',
  },
  rowMenu: {
    trigger: (name: string) => `Ações de ${name}`,
    makeAdmin: 'Tornar coordenação',
    makeMember: 'Tornar analista',
    remove: 'Remover do time',
  },
  /** Coordination is admin in every pod: six names would say "all" at length. */
  allPods: 'Todos os pods',
  roles: {
    admin: 'Coordenação',
    member: 'Analista',
  },
  portfolio: (count: number) => `${count} ${count === 1 ? 'empresa' : 'empresas'}`,
  noPortfolio: '—',
  shared: (count: number) =>
    `${count} ${count === 1 ? 'destes clientes tem' : 'destes clientes têm'} mais de um analista hoje. A partir de novembro cada cliente tem analista único.`,
  notFound: 'Não encontramos esse time.',
  empty: {
    title: (group: string) => `${group} ainda não tem ninguém.`,
    /** Names the button instead of repeating it: one main action per screen. */
    canEdit: 'Use + Adicionar pessoa para o time começar a receber chamado.',
    cannotEdit: 'Só a coordenação inclui gente num time.',
  },
  addPerson: {
    button: '+ Adicionar pessoa',
    titleRoot: 'Incluir na operação',
    title: (group: string) => `Incluir em ${group}`,
    cancel: 'Cancelar',
    submit: 'Incluir',
    role: 'Papel',
    pod: 'Pod',
    person: 'Pessoa',
    search: 'Buscar pessoa',
    analyst: 'Analista',
    analystCaptionRoot: 'Entra em um pod, com carteira de clientes.',
    analystCaption: 'Recebe chamado dos clientes da carteira dela.',
    coordinationRoot: 'Coordenação da operação',
    coordination: (group: string) => `Coordenação de ${group}`,
    coordinationCaptionRoot:
      'Edita estrutura, membro e carteira de todos os pods. Não tem carteira própria.',
    coordinationCaption: 'Edita membro e carteira deste pod. Não tem carteira própria.',
    podCaption: (companies: number, analysts: number) =>
      `${companies} ${companies === 1 ? 'empresa' : 'empresas'} · ${analysts} ${
        analysts === 1 ? 'analista' : 'analistas'
      }`,
    nobodyLeft: (group: string) => `Todo mundo que casa com essa busca já está em ${group}.`,
    elsewhere: (name: string, pods: { name: string; companies: number }[]) =>
      `${name} já está em ${pods
        .map(
          (pod) => `${pod.name} (${pod.companies} ${pod.companies === 1 ? 'empresa' : 'empresas'})`,
        )
        .join(', ')}.`,
    emptyPortfolio:
      'A pessoa entra sem carteira. Enquanto estiver assim, o trabalho dos clientes sem dono chega por rodízio.',
  },
  newView: '+ Nova view',
  editableBy: (group: string) => `Só a coordenação de ${group} edita carteira e membros.`,
  carteiras: {
    search: 'Buscar empresa…',
    /** Echoes the term back: an empty table with only headers reads as a
     *  broken tab, not as "nothing matched what you typed". */
    noMatch: (query: string) => `Nenhuma empresa da carteira casa com “${query}”.`,
    /** A group with no portfolio of its own is not a failed search — the
     *  breadcrumb of any pod leads to the directorate above it, which holds
     *  none. Saying `casa com “”` there quoted a search nobody made. */
    noPortfolio:
      'Este grupo não tem carteira própria. As empresas ficam nas carteiras dos times abaixo dele.',
    company: 'Empresa',
    owner: 'Dono',
    /** No owner here is not an error: it is rotation. The alert color is for
     *  coordination to resolve. */
    rotation: 'Na rotação',
    editPending: 'Alocar empresa e editar carteira chegam com o PD-108.',
  },
  views: {
    intro:
      'Cada recorte é um filtro salvo com uma política de distribuição. A política diz como o chamado acha a pessoa — e é ela que faz «nenhuma demanda sem dono» ser verdade.',
    name: 'Recorte',
    criterion: 'Critério',
    policy: 'Política',
    noFilter: 'sem filtro — o pod inteiro',
    byOwner: 'Pelo dono da empresa',
    undefinedBadge: 'Falta definir',
    policyPendingTitle: 'A política ainda não se configura aqui',
    policyPendingBody:
      'A spec técnica tem o campo (assignment_mode, em ticket_queues) e não lista os valores possíveis. Oferecer um seletor agora seria inventar vocabulário de domínio.',
  },
}
