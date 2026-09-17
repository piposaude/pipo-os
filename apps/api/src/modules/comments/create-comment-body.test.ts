import { describe, expect, it } from 'vitest'
import { createCommentBodySchema, withDefaultKind } from './schemas.js'

const manual = { kind: 'manual', visibility: 'public', body: 'liguei na operadora' }
const event = {
  kind: 'automated_event',
  eventType: 'document_signature_sent',
  visibility: 'private',
  body: 'Documento enviado para assinatura',
}

describe('the body of POST /tickets/:id/comments', () => {
  it('takes the manual comment it always took', () => {
    expect(createCommentBodySchema.parse(manual)).toMatchObject(manual)
  })

  it('takes an automated event naming what happened', () => {
    expect(
      createCommentBodySchema.parse({ ...event, metadata: { documentType: 'rg' } }),
    ).toMatchObject({ ...event, metadata: { documentType: 'rg' } })
  })

  it('gives an automated event an empty metadata rather than none', () => {
    expect(createCommentBodySchema.parse(event)).toMatchObject({ metadata: {} })
  })

  it('refuses an event type outside the catalog, naming the field', () => {
    const parsed = createCommentBodySchema.safeParse({ ...event, eventType: 'ticket_exploded' })

    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.path).toEqual(['eventType'])
  })

  it('refuses an event with no type at all', () => {
    const { kind, visibility, body } = event
    expect(createCommentBodySchema.safeParse({ kind, visibility, body }).success).toBe(false)
  })

  it('refuses a key it does not know', () => {
    expect(createCommentBodySchema.safeParse({ ...manual, channel: 'email' }).success).toBe(false)
  })
})

/* The route fills the discriminator before validation, so the body every
   caller sends today — `visibility` and `body`, no `kind` — keeps working.
   Zod 4 does not reach the default of a discriminator it cannot read, and a
   `preprocess` around the union would drop the required keys from the exported
   contract, the lesson tickets/enrollment-type.ts already paid for. */
describe('the discriminator the route fills in', () => {
  it('reads a body with no kind as the manual comment it always was', () => {
    expect(
      createCommentBodySchema.parse(withDefaultKind({ visibility: 'public', body: 'oi' })),
    ).toMatchObject({ kind: 'manual', visibility: 'public', body: 'oi' })
  })

  it('leaves a kind the caller stated alone', () => {
    expect(withDefaultKind(event)).toMatchObject({ kind: 'automated_event' })
  })

  it('leaves a body that is not an object alone, for the schema to refuse', () => {
    expect(withDefaultKind('nope')).toBe('nope')
    expect(withDefaultKind(null)).toBe(null)
  })
})
