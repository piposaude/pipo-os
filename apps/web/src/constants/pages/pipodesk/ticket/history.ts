/** The Histórico tab: the beneficiary's open tickets, and the current one. */
export default {
  columns: {
    id: 'ID',
    movement: 'Movimentação',
    carrier: 'Operadora',
    openedAt: 'Aberto em',
    situation: 'Situação',
  },
  closedAt: (date: string) => `em ${date}`,
  openOnly: 'Mostra os chamados em aberto desta pessoa. Chamados já fechados não aparecem aqui.',
}
