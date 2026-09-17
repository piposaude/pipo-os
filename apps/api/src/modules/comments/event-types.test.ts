import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  API_EVENT_TYPES,
  SERVICE_EVENT_TYPES,
  TICKET_EVENT_TYPES,
  serviceEventTypeSchema,
  ticketEventTypeSchema,
} from './event-types.js'

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

describe('the half a service may post', () => {
  it.each(SERVICE_EVENT_TYPES)('accepts %s', (eventType) => {
    expect(serviceEventTypeSchema.parse(eventType)).toBe(eventType)
  })

  it.each(API_EVENT_TYPES)('refuses %s, which only the API records', (eventType) => {
    expect(serviceEventTypeSchema.safeParse(eventType).success).toBe(false)
  })

  it('together with the API half, is the whole catalog', () => {
    expect([...SERVICE_EVENT_TYPES, ...API_EVENT_TYPES]).toEqual([...TICKET_EVENT_TYPES])
  })
})

/** Declared in contract/ but out of ticket-vocabulary.json on purpose: that
 *  file holds apps/web to pt-BR copy for every word it names, and the web only
 *  renders the chronology from PD-103 on. */
const CATALOG_PATH = fileURLToPath(
  new URL('../../../../../contract/ticket-event-types.json', import.meta.url),
)

describe('the catalog declared in the contract', () => {
  const { eventTypes, writableByService } = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8')) as {
    eventTypes: string[]
    writableByService: { eventTypes: string[] }
  }

  it('lists exactly what an automated event can say happened', () => {
    expect([...eventTypes].sort()).toEqual([...TICKET_EVENT_TYPES].sort())
  })

  it('names exactly the half the route accepts', () => {
    expect([...writableByService.eventTypes].sort()).toEqual([...SERVICE_EVENT_TYPES].sort())
  })
})
