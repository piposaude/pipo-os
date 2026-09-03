import { formatCount } from '@/lib/pipodesk/format'

export default {
  open: (count: number) =>
    `${formatCount(count)} ${count === 1 ? 'chamado aberto' : 'chamados abertos'}`,
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
    portfolio: 'Carteira',
    open: 'Abertos',
  },
  roles: {
    admin: 'Coordenação',
    member: 'Analista',
  },
  portfolio: (count: number) => `${count} ${count === 1 ? 'empresa' : 'empresas'}`,
  noPortfolio: '—',
  notFound: 'Não encontramos esse time.',
  editableBy: (group: string) => `Só a coordenação de ${group} edita carteira e membros.`,
  /** Editing (add person, move company, rename, delete) is the rest of PD-105. */
  readOnly: 'Editar carteira e membros chega com o PD-105.',
  tabs: {
    home: 'Home',
    carteiras: 'Carteiras',
    views: 'Views',
  },
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
    editPending: 'Alocar empresa e editar carteira chegam com o resto do PD-105.',
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
