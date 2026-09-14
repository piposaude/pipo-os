/** The Documentos tab reads what the Backoffice produced; it generates nothing. */
export default {
  missing: {
    title: 'Ainda falta',
    /* The pendency is what the ticket states; a file arriving does not close it. */
    arrived: 'arquivo recebido, pendência aberta',
  },
  fromClient: {
    title: 'Recebidos do cliente',
    empty: 'Nada recebido do cliente neste chamado.',
  },
  fromPipo: {
    title: 'Gerados pela Pipo',
    empty: 'Nenhum documento gerado pela Pipo para este chamado.',
    notInclusion: (type: string) =>
      `${type} não gera ficha de adesão — só a inclusão passa pelo Adobe Sign.`,
  },
  mandatory: {
    title: 'Obrigatórios para esta empresa',
    unmapped: (company: string | null) =>
      `Não mapeados${company ? ` para ${company}` : ''}. Quais documentos cada empresa e ` +
      'operadora exigem não está em sistema nenhum — mora nas planilhas de particularidade ' +
      'das analistas —, e é por isso que o chamado abre incompleto e o documento é cobrado ' +
      'depois. O campo entra no cadastro da empresa quando a regra tiver dono.',
  },
  /** Only shown when there is more than one: on a lone file the word would
   *  state the obvious. */
  version: { current: 'vigente', superseded: 'substituída' },
  note: {
    empty: 'Adicionar observação',
    placeholder: 'Observação sobre esta versão',
    label: (name: string) => `Observação sobre ${name}`,
  },
  download: (name: string, which: string | null, as: string) =>
    `Baixar ${name}${which ? ` (${which})` : ''} como ${as}`,
  downloadUnavailable: 'Ainda não há arquivo para baixar.',
  size: (kb: number) => `${kb} KB`,
}
