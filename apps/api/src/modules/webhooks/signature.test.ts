import { describe, expect, it } from 'vitest'
import { signatureHeaders } from './signature.js'

const body =
  '{"delivery_id":"55555555-5555-4555-8555-555555555555","reason":"Operadora não confirmou a inclusão"}'

describe('signatureHeaders', () => {
  it('signs the timestamp followed by the raw body, as base64 of an HMAC-SHA256', () => {
    expect(signatureHeaders('segredo-de-teste', body, new Date('2026-09-25T14:30:00Z'))).toEqual({
      'X-Pipodesk-Webhook-Signature-Timestamp': '2026-09-25T14:30:00.000Z',
      'X-Pipodesk-Webhook-Signature': '1dKi6j/7QltTZFRBrJMBLL8dnOEGObfYJoKyD3FXKuE=',
    })
  })
})
