/** The global search palette (⌘K). */
export default {
  title: 'Busca global',
  field: 'Buscar chamados, beneficiários, empresas e visões',
  placeholder: 'Buscar…',
  results: 'Resultados',
  close: 'Fechar',
  nothing: 'Nada encontrado.',
  total: (count: number) => ` · ${count} no total`,
  shortcuts: [
    { label: 'Navegar', key: '↑↓' },
    { label: 'Abrir', key: '↵' },
    { label: 'Fechar', key: 'Esc' },
  ],
}
