import { createHmac } from 'node:crypto'

export function signatureHeaders(secret: string, body: string, at: Date) {
  const timestamp = at.toISOString()
  const signature = createHmac('sha256', secret).update(timestamp).update(body).digest('base64')
  return {
    'X-Pipodesk-Webhook-Signature-Timestamp': timestamp,
    'X-Pipodesk-Webhook-Signature': signature,
  }
}
