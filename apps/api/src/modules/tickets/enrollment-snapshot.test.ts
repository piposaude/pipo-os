import { describe, expect, it } from 'vitest'
import { movementFieldsOf, relationshipOf } from './enrollment-snapshot.js'

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

  /** The web read this path too, and the value is frozen at creation. */
  it('falls back to the member_type nested under primary', () => {
    expect(relationshipOf({ primary: { 'member-type': 'dependent' } })).toBe('dependent')
    expect(relationshipOf({ primary: { memberType: 'primary' }, dependents: [{ id: 'd1' }] })).toBe(
      'family-group',
    )
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

describe('movementFieldsOf', () => {
  it('reads the five fields the EI sends today inside the snapshot', () => {
    expect(
      movementFieldsOf({
        'carrier-id': 'carrier-unimed',
        'carrier-name': 'Unimed Mineira',
        contract: { 'product-type': 'health-insurance' },
        primary: { employment: { 'contract-type': 'brazil-labor-law' } },
        company: { 'company-size': 'corporate' },
      }),
    ).toEqual({
      carrierId: 'carrier-unimed',
      carrierName: 'Unimed Mineira',
      product: 'health-insurance',
      contractType: 'brazil-labor-law',
      companySize: 'corporate',
    })
  })

  it('accepts the second path of each field, and camelCase keys', () => {
    expect(
      movementFieldsOf({
        carrier: { id: 'carrier-amil', name: 'Amil' },
        productType: 'dental-insurance',
        'work-contract-type': 'services-contract',
        company: { porte: 'smb' },
      }),
    ).toEqual({
      carrierId: 'carrier-amil',
      carrierName: 'Amil',
      product: 'dental-insurance',
      contractType: 'services-contract',
      companySize: 'smb',
    })
  })

  it('keeps the EI word instead of translating it', () => {
    expect(movementFieldsOf({ company: { 'company-size': 'smb' } }).companySize).toBe('smb')
  })

  it('is all nulls when the snapshot has nothing, or is not an object', () => {
    const empty = {
      carrierId: null,
      carrierName: null,
      product: null,
      contractType: null,
      companySize: null,
    }

    expect(movementFieldsOf({})).toEqual(empty)
    expect(movementFieldsOf(null)).toEqual(empty)
    expect(movementFieldsOf('not an object')).toEqual(empty)
  })

  it('ignores a blank string, which fills a column with nothing', () => {
    expect(movementFieldsOf({ 'carrier-id': '   ' }).carrierId).toBeNull()
  })

  it('reads own keys only, not inherited ones', () => {
    expect(movementFieldsOf(Object.create({ 'carrier-id': 'herdado' })).carrierId).toBeNull()
  })

  it('does not walk into a segment that is not an object', () => {
    expect(movementFieldsOf({ carrier: 'unimed' }).carrierId).toBeNull()
  })
})
