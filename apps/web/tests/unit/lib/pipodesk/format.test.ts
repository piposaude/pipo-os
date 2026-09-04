// @vitest-environment node
import {
  daysBetween,
  daysOpenOf,
  daysOverdue,
  displayNameFromEmail,
  formatCount,
  formatDate,
  formatDayMonth,
  formatLongDate,
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

describe('formatLongDate', () => {
  it('should spell the month in pt-BR without the year, keeping the two-digit day', () => {
    expect(formatLongDate('2026-07-13')).toBe('13 de Julho')
    expect(formatLongDate('2025-12-03T10:00:00.000Z')).toBe('03 de Dezembro')
  })

  it('should fall back to the dash for a missing or unreadable date', () => {
    expect(formatLongDate(null)).toBe('—')
    expect(formatLongDate('not-a-date')).toBe('—')
    expect(formatLongDate('2026-13-01')).toBe('—')
  })
})

describe('formatDate', () => {
  it('should show the full date, day first', () => {
    expect(formatDate('2026-08-11')).toBe('11/08/2026')
    expect(formatDate('2025-12-03T10:00:00.000Z')).toBe('03/12/2025')
  })

  /** The reversed-split it replaced turned these into `//` and `etad-a-ton`
   *  on screen — it had no notion of an unreadable date. */
  it('should return a dash for an unusable value', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate('')).toBe('—')
    expect(formatDate('not-a-date')).toBe('—')
  })

  /** `Date.parse` takes `11/08/2026`, but splitting it on `-` yields one part
   *  and printing by position gave `undefined/undefined/11/08/2026`. Checking
   *  the shape is what the `—` fallback always claimed to do. */
  it('should not print garbage for a real date written in another shape', () => {
    expect(formatDate('11/08/2026')).toBe('—')
    expect(formatDate('2026/08/11')).toBe('—')
    expect(formatDayMonth('11/08/2026', '2026-08-07')).toBe('—')
    // An out-of-range part is what `Date.parse` still catches for us.
    expect(formatDate('2026-13-01')).toBe('—')
    // But `2026-02-30` it rolls into March. The parts are printed as given, so
    // the date shows what was filed instead of silently moving a day.
    expect(formatDate('2026-02-30')).toBe('30/02/2026')
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

  it('should still warn on the last whole day when the limit is not a multiple of 24h', () => {
    const reading = slaOf(
      { createdAt: '2026-08-30T00:00:00.000Z' },
      { hours: 36, hasPenalty: false },
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

/**
 * `Date.parse` returns `NaN` for anything it cannot read, and NaN comparisons
 * are all false — so an unreadable date used to render "em NaNd" in the Prazo
 * column and read as `ok` in the SLA. Every reading must say "I don't know"
 * instead of guessing the safe side.
 */
describe('datas que não parseiam', () => {
  const BROKEN = ['', '   ', 'ontem', '2026-13-99', '31/08/2026']

  it('should have no day count', () => {
    for (const value of BROKEN) {
      expect(daysBetween(value, TODAY), value).toBeNull()
      expect(daysBetween(TODAY, value), value).toBeNull()
      expect(daysOverdue(value, TODAY), value).toBeNull()
      expect(daysOpenOf(value, TODAY), value).toBeNull()
    }
  })

  it('should show a dash in the deadline, never "NaN"', () => {
    for (const value of BROKEN) {
      expect(formatPrazo(value, TODAY), value).toBe('—')
    }
  })

  it('should have no deadline color, so the row shows no chip', () => {
    for (const value of BROKEN) {
      expect(prazoVariant(value, TODAY), value).toBeNull()
    }
  })

  /** The dangerous one: `state: 'ok'` on an unreadable date announces a ticket
   *  as within SLA. Not knowing is not the same as being fine. */
  it('should have no SLA state when the ticket age is unknown', () => {
    const reading = slaOf({ createdAt: '' }, { hours: 48, hasPenalty: true }, TODAY)

    expect(reading.daysOpen).toBeNull()
    expect(reading.state).toBeNull()
    expect(reading.limitHours).toBe(48)
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
