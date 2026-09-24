import { describe, expect, it } from 'vitest'
import { createSubmissionBodySchema } from './schemas.js'

const pathsOf = (body: unknown) =>
  createSubmissionBodySchema.safeParse(body).error?.issues.map((issue) => issue.path) ?? []

describe('the body of POST /tickets/:id/submissions', () => {
  it('takes the same text for the team and for HR', () => {
    const body = {
      parts: [
        { channel: 'internal', body: 'enviado para a operadora' },
        { channel: 'platform', body: 'enviado para a operadora' },
      ],
    }

    expect(createSubmissionBodySchema.parse(body)).toEqual(body)
  })

  it('takes a status with no text', () => {
    const body = { status: { status: 'carrier-processing', reason: 'cobrar segunda' } }

    expect(createSubmissionBodySchema.parse(body)).toEqual({ parts: [], ...body })
  })

  it('takes the completion block under the status it belongs to', () => {
    const completion = {
      members: [{ taxId: '22222222222', idCardNumber: 'C-1', startDate: '2026-10-01' }],
    }

    expect(
      createSubmissionBodySchema.parse({ status: { status: 'completed', completion } }).status,
    ).toEqual({ status: 'completed', completion })
  })

  it('refuses a submission with neither text nor status', () => {
    expect(pathsOf({ parts: [] })).toEqual([['parts']])
  })

  it('refuses two parts on the same channel', () => {
    const parts = [
      { channel: 'internal', body: 'um' },
      { channel: 'internal', body: 'dois' },
    ]

    expect(pathsOf({ parts })).toEqual([['parts', 1, 'channel']])
  })

  it('refuses e-mail, which is not a destination yet', () => {
    expect(pathsOf({ parts: [{ channel: 'email', body: 'oi' }] })).toEqual([
      ['parts', 0, 'channel'],
    ])
  })

  it('refuses a blank part', () => {
    expect(pathsOf({ parts: [{ channel: 'internal', body: '   ' }] })).toEqual([
      ['parts', 0, 'body'],
    ])
  })

  it('refuses completion under a status that is not completed', () => {
    const status = { status: 'carrier-processing', completion: { endDate: '2026-10-31' } }

    expect(pathsOf({ status })).toEqual([['status', 'completion']])
  })

  it('takes inReplyTo only as a uuid', () => {
    const parts = [{ channel: 'internal', body: 'respondendo' }]

    expect(pathsOf({ parts, inReplyTo: 'abc' })).toEqual([['inReplyTo']])
    expect(
      createSubmissionBodySchema.parse({ parts, inReplyTo: '00000000-0000-4000-8000-0000000000aa' })
        .inReplyTo,
    ).toBe('00000000-0000-4000-8000-0000000000aa')
  })

  it('refuses a field it does not know', () => {
    const parts = [{ channel: 'internal', body: 'oi' }]

    expect(pathsOf({ parts, submissionId: '00000000-0000-4000-8000-0000000000aa' })).toEqual([[]])
  })
})
