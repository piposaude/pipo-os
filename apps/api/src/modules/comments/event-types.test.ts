import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TICKET_EVENT_TYPES, ticketEventTypeSchema } from './event-types.js'

describe('the automated event catalog', () => {
  it.each(TICKET_EVENT_TYPES)('accepts %s', (eventType) => {
    expect(ticketEventTypeSchema.parse(eventType)).toBe(eventType)
  })

  it('refuses a word it does not name', () => {
    expect(ticketEventTypeSchema.safeParse('ticket_exploded').success).toBe(false)
  })

  it('has no duplicate', () => {
    expect(new Set(TICKET_EVENT_TYPES).size).toBe(TICKET_EVENT_TYPES.length)
  })
})

/** The catalog is a vocabulary the front has to have copy for, so it is
 *  declared in contract/ like the others. It is not in ticket-vocabulary.json:
 *  that file holds apps/web to pt-BR copy for every word, and the web does not
 *  read the chronology from the API yet (PD-103). This file is read by the API
 *  alone until then, and the web joins when it renders the timeline. */
const CATALOG_PATH = fileURLToPath(
  new URL('../../../../../contract/ticket-event-types.json', import.meta.url),
)

describe('the catalog declared in the contract', () => {
  const { eventTypes } = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8')) as {
    eventTypes: string[]
  }

  it('lists exactly what an automated event can say happened', () => {
    expect([...eventTypes].sort()).toEqual([...TICKET_EVENT_TYPES].sort())
  })
})
