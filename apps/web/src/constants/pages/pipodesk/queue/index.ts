export default {
  pills: 'Recortes e views deste nível',
  saveView: 'Salvar esta fila como view',
  saveViewPending: 'Salvar view chega com o PD-104.',
  filters: 'Filtros',
  display: 'Exibição',
  selectAll: 'Selecionar todos os chamados desta fila',
  selectRow: 'Selecionar chamado',
  empty: {
    title: 'Nenhum chamado nesta fila',
    subtitle: 'Troque de recorte na barra acima ou escolha outro nó na árvore.',
  },
  /** Live region: screen readers hear the total on every queue switch. The
   *  number left the visible header, not this. */
  liveCount: (count: number, label: string) =>
    `${count} ${count === 1 ? 'chamado' : 'chamados'} em ${label}`,
  liveCountLabel: 'Total da fila',
  writeFailed: 'Não foi possível salvar a alteração. A tela voltou ao que está gravado.',
  dismiss: 'Entendi',
  truncated: (shown: number, total: number) =>
    `Mostrando um recorte: ${shown.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} chamados. As contagens da árvore valem só para o que está aqui.`,
  free: 'Livre no pod',
  batchFinalKept: (count: number) =>
    `${count} ${count === 1 ? 'chamado' : 'chamados'} em estado final ${
      count === 1 ? 'não muda' : 'não mudam'
    } de situação: concluído e cancelado não reabrem.`,
  empty_cell: '—',
  priority: {
    label: 'Prioridade',
    none: 'Sem prioridade',
    set: (ticketNumber: string) => `Sem prioridade. Definir prioridade do chamado ${ticketNumber}`,
    change: (level: string) => `Prioridade ${level}. Trocar`,
  },
}
