import type { Emphasized } from './record'

/** The Dados pessoais tab — the Backoffice record, in the order it prints. */
export default {
  role: {
    holder: 'Titular',
    dependent: 'Dependente',
  },
  dependentOf: 'Dependente de',
  /* Elegibilidade vem do emprego do titular; sem ele, não há o que mostrar aqui. */
  holderMissing: 'O titular deste dependente não está no retrato desta movimentação.',
  dependentContact: [
    'O dependente ',
    'não tem contato próprio',
    ' no cadastro — e-mail e telefone de registro são os do titular, então não aparecem aqui como se fossem dele.',
  ] as Emphasized,
  sections: {
    personal: 'Dados pessoais',
    holder: 'Dados de vínculo',
    contact: 'Dados de contato',
    refund: 'Dados de reembolso',
    dependents: 'Dependentes',
    cards: 'Carteirinhas',
  },
  fields: {
    id: 'ID',
    socialName: 'Nome social',
    name: 'Nome de registro',
    birthDate: 'Data de nascimento',
    cpf: 'CPF',
    sex: 'Sexo atribuído ao nascimento',
    maritalStatus: 'Estado civil',
    weight: 'Peso',
    height: 'Altura',
    motherName: 'Nome da mãe',
    /* The holder section describes the policy holder's job, whoever is on
       screen — hence "do titular" on every label. */
    company: 'Empresa do titular',
    cnpj: 'CNPJ do titular',
    admissionDate: 'Data de admissão do titular',
    contractType: 'Tipo de vínculo do titular',
    salary: 'Salário do titular',
    registration: 'Matrícula do titular',
    jobTitle: 'Cargo do titular',
    costCenter: 'Centro de custo do titular',
    email: 'E-mail',
    phone: 'Celular',
    zip: 'CEP',
    street: 'Endereço',
    district: 'Bairro',
    number: 'Número',
    complement: 'Complemento',
    uf: 'UF',
    city: 'Município',
  },
  socialNameNote: [
    'O ',
    'assunto do chamado',
    ' carrega o nome de registro, não o social: ele vem da operadora e do fluxo de origem, e o Pipodesk não o reescreve. Ver os dois em desacordo na mesma tela é esperado.',
  ] as Emphasized,
  refund: {
    holderBadge: 'do titular',
    empty: 'Nenhuma conta cadastrada.',
    fields: {
      holderName: 'Nome do titular da conta bancária',
      holderCpf: 'CPF do titular da conta bancária',
      bank: 'Banco',
      agency: 'Agência',
      account: 'Conta corrente',
    },
    dependentNote: [
      'O dependente ',
      'não tem conta própria',
      ': o reembolso dele cai na conta do titular, que é a mostrada aqui.',
    ] as Emphasized,
  },
  dependents: {
    noBenefit: 'sem benefício',
    /* "Vínculo" reads "Dependente" on every row: the record carries no
       kinship, so the column aligns the table, it does not tell rows apart. */
    columns: {
      name: 'Nome',
      relationship: 'Vínculo',
      birthDate: 'Nascimento',
      cpf: 'CPF',
      benefits: 'Benefícios',
    },
    note: [
      'Elegibilidade de dependente é diferente por produto: é comum em saúde e odonto, e muitas vezes MB não aceita. O que aparece aqui é o que cada dependente ',
      'tem',
      ', não o que ele herdaria do titular.',
    ] as Emphasized,
  },
  cards: {
    carrier: 'Operadora',
    benefit: 'Benefício',
    number: 'Número',
    since: 'Início',
    empty: 'Nenhuma carteirinha.',
  },
}
