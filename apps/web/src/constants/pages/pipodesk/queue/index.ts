export default {
  pills: 'Recortes e views deste nível',
  saveView: 'Salvar esta fila como view',
  saveViewDialog: {
    title: 'Salvar visão',
    name: 'Nome',
    namePlaceholder: 'Exclusões vencidas',
    nameMissing: 'Dê um nome à visão antes de salvar.',
    refused: 'Não foi possível salvar a visão.',
    where: 'Onde ela mora',
    whereHint:
      'Ela vai aparecer dentro deste time. Para trazê-la para o topo, favorite com a estrela.',
    cancel: 'Cancelar',
    save: 'Salvar',
  },
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
}
