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
  free: 'Livre no pod',
  empty_cell: '—',
}
