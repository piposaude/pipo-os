// @vitest-environment node
import constants from '@/constants/pages/pipodesk/ticket'

describe('ticket copy', () => {
  it('should agree the overdue lead with one day or with many', () => {
    expect(constants.overdueLead(1)).toBe('Movimentação está atrasada em 1 dia')
    expect(constants.overdueLead(25)).toBe('Movimentação está atrasada em 25 dias')
  })

  it('should end only the filed-date part with a period', () => {
    expect(constants.overdueDate('13 de Julho')).toBe('Registrada para 13 de Julho.')
    expect(constants.overdueLead(25)).not.toMatch(/\.$/)
  })
})
