/** The Histórico tab: the open tickets of the holder's family, and the current one. */
export default {
  columns: {
    id: 'ID',
    movement: 'Movimentação',
    carrier: 'Operadora',
    openedAt: 'Aberto em',
    situation: 'Situação',
  },
  closedAt: (date: string) => `em ${date}`,
  openOnly:
    'Mostra os chamados em aberto do mesmo titular, incluindo os dos dependentes. Chamados já fechados não aparecem aqui.',
}
