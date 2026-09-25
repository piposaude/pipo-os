// @vitest-environment node
import { API_STATUSES } from '@/lib/pipodesk/status'
import {
  EMPTY_DRAFT,
  SEND_STATUSES,
  partsOf,
  statusChangeOf,
  submissionBodyOf,
  toggleDestination,
  toggleSplit,
  withCompletionValue,
  withStatus,
  withText,
  type ComposerDraft,
} from '@/lib/pipodesk/composer'

const both: ComposerDraft = { ...EMPTY_DRAFT, destinations: ['internal', 'platform'] }

describe('toggleDestination', () => {
  it('should start on the internal note alone', () => {
    expect(EMPTY_DRAFT.destinations).toEqual(['internal'])
  })

  it('should add a destination in the fixed order, whatever the order of the clicks', () => {
    const platformOnly = { ...EMPTY_DRAFT, destinations: ['platform' as const] }

    expect(toggleDestination(platformOnly, 'internal').destinations).toEqual([
      'internal',
      'platform',
    ])
  })

  it('should take a destination off', () => {
    expect(toggleDestination(both, 'internal').destinations).toEqual(['platform'])
  })

  it('should never take the last destination off', () => {
    expect(toggleDestination(EMPTY_DRAFT, 'internal').destinations).toEqual(['internal'])
  })

  it('should not turn on a parked destination', () => {
    expect(toggleDestination(EMPTY_DRAFT, 'email').destinations).toEqual(['internal'])
  })
})

describe('partsOf', () => {
  it('should send the one text to every destination on, trimmed', () => {
    expect(partsOf(withText(both, '  Carteirinha enviada.  '))).toEqual([
      { channel: 'internal', body: 'Carteirinha enviada.' },
      { channel: 'platform', body: 'Carteirinha enviada.' },
    ])
  })

  it('should send nothing when the text is blank', () => {
    expect(partsOf(withText(both, '   '))).toEqual([])
  })

  it('should send each destination its own text when the texts are split', () => {
    const split = withText(
      withText(toggleSplit(both), 'Para a operação.', 'internal'),
      '',
      'platform',
    )

    expect(partsOf(split)).toEqual([{ channel: 'internal', body: 'Para a operação.' }])
  })
})

describe('toggleSplit', () => {
  it('should start every box with the text already written', () => {
    const split = toggleSplit(withText(both, 'Rascunho.'))

    expect(split.split).toEqual({ internal: 'Rascunho.', platform: 'Rascunho.' })
  })

  it('should keep the first box as the one text on closing, and the others for later', () => {
    const split = withText(
      withText(toggleSplit(both), 'Só para a operação.', 'internal'),
      'Só para o RH.',
      'platform',
    )
    const closed = toggleSplit(split)

    expect(closed.split).toBeNull()
    expect(closed.text).toBe('Só para a operação.')

    const reopened = toggleSplit(withText(closed, 'Editado com as caixas fechadas.'))

    expect(reopened.split).toEqual({
      internal: 'Editado com as caixas fechadas.',
      platform: 'Só para o RH.',
    })
  })
})

describe('SEND_STATUSES', () => {
  it('should offer every status of the API, each reason next to its screen state', () => {
    expect([...SEND_STATUSES].sort()).toEqual([...API_STATUSES].sort())
    expect(SEND_STATUSES.slice(0, 3)).toEqual([
      'broker-processing',
      'broker-open-issue',
      'carrier-processing',
    ])
  })
})

describe('statusChangeOf', () => {
  it('should carry no change while the situation was not picked', () => {
    expect(statusChangeOf(EMPTY_DRAFT, 'carrier-processing')).toBeNull()
  })

  it('should carry no change when the picked situation is the current one', () => {
    expect(
      statusChangeOf(withStatus(EMPTY_DRAFT, 'carrier-processing'), 'carrier-processing'),
    ).toBeNull()
  })

  it('should carry the situation picked by hand', () => {
    expect(statusChangeOf(withStatus(EMPTY_DRAFT, 'missing-documents'), 'carrier-processing')).toBe(
      'missing-documents',
    )
  })
})

describe('submissionBodyOf', () => {
  it('should carry the parts alone when the situation does not change', () => {
    expect(submissionBodyOf(withText(EMPTY_DRAFT, 'Oi.'), 'carrier-processing', 'id-1')).toEqual({
      submissionId: 'id-1',
      parts: [{ channel: 'internal', body: 'Oi.' }],
    })
  })

  it('should carry the new situation next to the parts', () => {
    const draft = withStatus(withText(EMPTY_DRAFT, 'Oi.'), 'missing-documents')

    expect(submissionBodyOf(draft, 'carrier-processing', 'id-1')).toEqual({
      submissionId: 'id-1',
      parts: [{ channel: 'internal', body: 'Oi.' }],
      status: { status: 'missing-documents' },
    })
  })

  it('should carry the completion block only with a completion', () => {
    const completion = { endDate: '2026-10-01' }

    expect(
      submissionBodyOf(
        withStatus(EMPTY_DRAFT, 'completed'),
        'carrier-processing',
        'id-1',
        completion,
      ),
    ).toEqual({ submissionId: 'id-1', parts: [], status: { status: 'completed', completion } })
    expect(
      submissionBodyOf(
        withStatus(EMPTY_DRAFT, 'cancelled'),
        'carrier-processing',
        'id-1',
        completion,
      ),
    ).toEqual({ submissionId: 'id-1', parts: [], status: { status: 'cancelled' } })
  })
})

describe('withCompletionValue', () => {
  it('should keep each completion field of the draft by its key', () => {
    const draft = withCompletionValue(
      withCompletionValue(EMPTY_DRAFT, 'endDate', '2026-08-31'),
      'x',
      '1',
    )

    expect(draft.completion).toEqual({ endDate: '2026-08-31', x: '1' })
    expect(EMPTY_DRAFT.completion).toEqual({})
  })
})
