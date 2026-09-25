import { describe, expect, it } from 'vitest'
import { openPendenciesOf } from './open-pendencies.js'

const T1 = '2026-09-01T12:00:00.000Z'
const T2 = '2026-09-02T12:00:00.000Z'
const T3 = '2026-09-03T12:00:00.000Z'

describe('openPendenciesOf', () => {
  it('opens an item at its first charge, charged once', () => {
    expect(openPendenciesOf([{ action: 'opened', itemIds: ['rg', 'cpf'], at: T1 }])).toEqual([
      { itemId: 'rg', since: T1, chargedCount: 1 },
      { itemId: 'cpf', since: T1, chargedCount: 1 },
    ])
  })

  it('counts a charge on an item that is still open, keeping when it opened', () => {
    expect(
      openPendenciesOf([
        { action: 'opened', itemIds: ['rg'], at: T1 },
        { action: 'opened', itemIds: ['rg'], at: T2 },
      ]),
    ).toEqual([{ itemId: 'rg', since: T1, chargedCount: 2 }])
  })

  it('closes the item that arrived', () => {
    expect(
      openPendenciesOf([
        { action: 'opened', itemIds: ['rg', 'cpf'], at: T1 },
        { action: 'resolved', itemIds: ['cpf'], at: T2 },
      ]),
    ).toEqual([{ itemId: 'rg', since: T1, chargedCount: 1 }])
  })

  it('starts the count over when an item that arrived is charged again', () => {
    expect(
      openPendenciesOf([
        { action: 'opened', itemIds: ['rg'], at: T1 },
        { action: 'opened', itemIds: ['rg'], at: T1 },
        { action: 'resolved', itemIds: ['rg'], at: T2 },
        { action: 'opened', itemIds: ['rg'], at: T3 },
      ]),
    ).toEqual([{ itemId: 'rg', since: T3, chargedCount: 1 }])
  })

  it('lets a resolution of an item that is not open change nothing', () => {
    expect(
      openPendenciesOf([
        { action: 'resolved', itemIds: ['rg'], at: T1 },
        { action: 'opened', itemIds: ['rg'], at: T2 },
      ]),
    ).toEqual([{ itemId: 'rg', since: T2, chargedCount: 1 }])
  })
})
