export default {
  nav: 'Navegação do Pipodesk',
  search: 'Buscar...',
  searchKeys: ['⌘', 'K'],
  emptyFavorites: 'Sem favoritos',
  /** The three team-page destinations, keyed by their `?tab=` value (`home` is
   *  the absence of the param). The team breadcrumb reads the same labels, so
   *  the link you clicked and the trail you land on never disagree. */
  adminLinks: { home: 'Home', portfolios: 'Carteiras', views: 'Views' },
  /** Names whose account the footer trigger opens — at rest it shows only the
   *  avatar. */
  account: (name: string) => `Conta de ${name}`,
  logout: 'Sair',
}
