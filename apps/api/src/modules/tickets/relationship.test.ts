import { describe, expect, it } from 'vitest'
import { relationshipOf } from './relationship.js'

describe('relationshipOf', () => {
  it('is dependent when the moved member is the dependent', () => {
    expect(relationshipOf({ member_type: 'dependent' })).toBe('dependent')
  })

  it('is family-group when a primary brings dependents along', () => {
    expect(relationshipOf({ member_type: 'primary', dependents: [{ id: 'd1' }] })).toBe(
      'family-group',
    )
  })

  it('is holder for a primary with an empty dependents list', () => {
    expect(relationshipOf({ member_type: 'primary', dependents: [] })).toBe('holder')
  })

  it('is holder when the dependents key is absent, not just empty', () => {
    expect(relationshipOf({ member_type: 'primary' })).toBe('holder')
  })

  it('reads member_type without depending on case or separator', () => {
    expect(relationshipOf({ member_type: 'Dependent' })).toBe('dependent')
    expect(relationshipOf({ memberType: 'dependent' })).toBe('dependent')
    expect(relationshipOf({ 'member-type': 'dependent' })).toBe('dependent')
  })

  it('is null when there is nothing to derive from', () => {
    expect(relationshipOf({})).toBeNull()
    expect(relationshipOf({ member_type: '' })).toBeNull()
    expect(relationshipOf(null)).toBeNull()
    expect(relationshipOf('not an object')).toBeNull()
  })

  it('does not read a key off Object.prototype', () => {
    expect(relationshipOf({ member_type: 'primary', dependents: 'constructor' })).toBe('holder')
  })
})
