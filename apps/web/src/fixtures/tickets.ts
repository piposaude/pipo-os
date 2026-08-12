import type { Ticket } from '@pipo-os/api-client'

export const ticketsFixture: Ticket[] = [
  {
    id: crypto.randomUUID(),
    title: 'Erro ao gerar fatura',
    description: 'A fatura de julho não é gerada para a empresa Acme.',
    status: 'open',
    createdAt: '2026-08-10T14:30:00.000Z',
  },
  {
    id: crypto.randomUUID(),
    title: 'Atualizar dados cadastrais',
    description: 'Beneficiária pediu correção do nome no cartão do plano.',
    status: 'in_progress',
    createdAt: '2026-08-11T09:15:00.000Z',
  },
  {
    id: crypto.randomUUID(),
    title: 'Segunda via do boleto',
    description: 'Empresa solicitou reemissão do boleto de agosto.',
    status: 'closed',
    createdAt: '2026-08-12T08:00:00.000Z',
  },
]
