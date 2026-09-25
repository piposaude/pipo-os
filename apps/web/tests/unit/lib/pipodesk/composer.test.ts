// @vitest-environment node
import {
  EMPTY_DRAFT,
  partsOf,
  toggleDestination,
  toggleSplit,
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
