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
    'broker-processing': 'Aguardando Pipo Saúde',
    'carrier-processing': 'Aguardando Operadora',
    'broker-open-issue': 'Pendência Interna',
    'missing-documents': 'Aguardando Documentos',
    'incorrect-data': 'Dados Incorretos',
    completed: 'Concluída',
    cancelled: 'Cancelada',
    'submitted-cancellation': 'Em Cancelamento',
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
