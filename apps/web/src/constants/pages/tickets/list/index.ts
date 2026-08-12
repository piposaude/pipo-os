export default {
  title: 'Tickets',
  form: {
    heading: 'Novo ticket',
    titleLabel: 'Título',
    titlePlaceholder: 'Resumo do problema',
    descriptionLabel: 'Descrição',
    descriptionPlaceholder: 'Descreva o problema em detalhes',
    submit: 'Criar ticket',
  },
  table: {
    title: 'Título',
    description: 'Descrição',
    status: 'Status',
    createdAt: 'Criado em',
    actions: 'Ações',
  },
  status: {
    open: 'Aberto',
    in_progress: 'Em andamento',
    closed: 'Fechado',
  },
  actions: {
    changeStatus: 'Alterar status',
    delete: 'Excluir ticket',
  },
  empty: {
    title: 'Nenhum ticket por aqui',
    subtitle: 'Crie o primeiro ticket usando o formulário acima.',
  },
  errors: {
    load: 'Não foi possível carregar os tickets. Recarregue a página.',
    action: 'Não foi possível completar a ação. Tente novamente.',
  },
}
