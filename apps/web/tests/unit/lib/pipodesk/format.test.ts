// @vitest-environment node
import {
  daysBetween,
  daysOpenOf,
  daysOverdue,
  displayNameFromEmail,
  formatCount,
  formatDayMonth,
  formatPrazo,
  prazoVariant,
  shortSidebarLabel,
  slaOf,
} from '@/lib/pipodesk/format'

const TODAY = '2026-08-31'

describe('daysOverdue', () => {
  it('should count how many days late an action date is', () => {
    expect(daysOverdue('2026-08-25', TODAY)).toBe(6)
    expect(daysOverdue(TODAY, TODAY)).toBe(0)
    expect(daysOverdue('2026-09-03', TODAY)).toBe(-3)
  })
})

describe('formatPrazo', () => {
  it('should say "hoje" for today, "Nd" for late and "em Nd" for the future', () => {
    expect(formatPrazo(TODAY, TODAY)).toBe('hoje')
    expect(formatPrazo('2026-08-25', TODAY)).toBe('6d')
    expect(formatPrazo('2026-09-03', TODAY)).toBe('em 3d')
  })
})

describe('prazoVariant', () => {
  it('should paint late as alert, today as warning and the future as neutral', () => {
    expect(prazoVariant('2026-08-25', TODAY)).toBe('alert')
    expect(prazoVariant(TODAY, TODAY)).toBe('warning')
    expect(prazoVariant('2026-09-03', TODAY)).toBe('neutral')
  })

  it('should render nothing at all when the ticket has no action date', () => {
    expect(prazoVariant(null, TODAY)).toBeNull()
  })
})

describe('formatDayMonth', () => {
  it('should show day and month, adding the year when it is not the current one', () => {
    expect(formatDayMonth('2026-08-11T10:00:00.000Z', TODAY)).toBe('11/08')
    expect(formatDayMonth('2025-12-03T10:00:00.000Z', TODAY)).toBe('03/12/25')
  })

  it('should return a dash for an unusable value', () => {
    expect(formatDayMonth(null, TODAY)).toBe('—')
    expect(formatDayMonth('not-a-date', TODAY)).toBe('—')
  })
})

describe('daysBetween and daysOpenOf', () => {
  it('should count whole days between two dates', () => {
    expect(daysBetween('2026-08-01', '2026-08-31')).toBe(30)
  })

  it('should count how long a ticket has been open', () => {
    expect(daysOpenOf('2026-08-25T10:00:00.000Z', TODAY)).toBe(6)
  })
})

describe('slaOf', () => {
  it('should have no state when the company has no contractual SLA', () => {
    const reading = slaOf({ createdAt: '2026-08-01T00:00:00.000Z' }, null, TODAY)

    expect(reading.state).toBeNull()
    expect(reading.daysOpen).toBe(30)
  })

  it('should breach when the ticket is open for longer than the limit', () => {
    const reading = slaOf(
      { createdAt: '2026-08-25T00:00:00.000Z' },
      { hours: 72, hasPenalty: true },
      TODAY,
    )

    expect(reading.state).toBe('breached')
    expect(reading.hasPenalty).toBe(true)
  })

  it('should warn on the last day, because the data has no hour precision', () => {
    const reading = slaOf(
      { createdAt: '2026-08-28T00:00:00.000Z' },
      { hours: 72, hasPenalty: false },
      TODAY,
    )

    expect(reading.state).toBe('warning')
  })

  it('should be ok with room to spare', () => {
    const reading = slaOf(
      { createdAt: '2026-08-30T00:00:00.000Z' },
      { hours: 72, hasPenalty: false },
      TODAY,
    )

    expect(reading.state).toBe('ok')
  })
})

describe('displayNameFromEmail', () => {
  it('should build a readable name from a pipo email while there is no users endpoint', () => {
    expect(displayNameFromEmail('ana.souza@pipo.health')).toBe('Ana Souza')
    expect(displayNameFromEmail('juliana.vilarta@piposaude.com.br')).toBe('Juliana Vilarta')
  })

  it('should keep the local part whole when there is no dot to split on', () => {
    expect(displayNameFromEmail('operacoes@pipo.health')).toBe('Operacoes')
  })

  it('should return the input unchanged when it is not an email', () => {
    expect(displayNameFromEmail('svc:enrollment-integrations')).toBe('svc:enrollment-integrations')
  })
})

describe('formatCount', () => {
  it('should group thousands the way pt-BR reads them', () => {
    expect(formatCount(6749)).toBe('6.749')
    expect(formatCount(0)).toBe('0')
    expect(formatCount(42)).toBe('42')
  })
})

describe('shortSidebarLabel', () => {
  it('should shorten only the label that does not fit the sidebar', () => {
    expect(shortSidebarLabel('Movimentações futuras')).toBe('Mov. futuras')
    expect(shortSidebarLabel('Meus tickets')).toBe('Meus tickets')
  })
})
