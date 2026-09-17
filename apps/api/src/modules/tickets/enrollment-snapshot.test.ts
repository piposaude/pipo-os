import { describe, expect, it } from 'vitest'
import {
  alterationTypeOf,
  companyFieldsOf,
  movementFieldsOf,
  relationshipOf,
} from './enrollment-snapshot.js'

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

  /** The EI's `memberTypePhrase` names three values, and `family` is the one
   *  that arrives without a primary of its own. */
  it('is family-group for the EI family, with no dependents list', () => {
    expect(relationshipOf({ member_type: 'family' })).toBe('family-group')
  })

  /** Reading every non-dependent as a holder invented an answer and froze it. */
  it('is null for a member_type outside the three the EI names', () => {
    expect(relationshipOf({ member_type: 'agregado', dependents: [{ id: 'd1' }] })).toBeNull()
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

describe('alterationTypeOf', () => {
  it('reads alteration_type in any of the three spellings', () => {
    expect(alterationTypeOf({ alteration_type: 'plan' })).toBe('plan')
    expect(alterationTypeOf({ 'alteration-type': 'registration' })).toBe('registration')
    expect(alterationTypeOf({ alterationType: 'combined' })).toBe('combined')
  })

  it('is null when the snapshot does not say, or says it blank', () => {
    expect(alterationTypeOf({ request_type: 'alteration' })).toBeNull()
    expect(alterationTypeOf({ alteration_type: '  ' })).toBeNull()
    expect(alterationTypeOf('not a snapshot')).toBeNull()
  })

  it('hands a value that is not a word over as it is, for the caller to refuse', () => {
    expect(alterationTypeOf({ alteration_type: 1 })).toBe(1)
  })

  it('returns the word raw, known or not', () => {
    expect(alterationTypeOf({ alteration_type: 'cnpj' })).toBe('cnpj')
  })
})

describe('companyFieldsOf', () => {
  it('brings the parent when the EI says the company is a branch', () => {
    expect(
      companyFieldsOf({
        company: {
          'company-tax-id': '11.111.111/0001-11',
          'parent-company-id': '00000000-0000-4000-8000-0000000000a1',
          'parent-company-name': 'Meridiano Holding',
          'parent-company-tax-id': '22.222.222/0001-22',
          'company-subsidiary': true,
        },
      }),
    ).toEqual({
      parentCompanyId: '00000000-0000-4000-8000-0000000000a1',
      parentCompanyName: 'Meridiano Holding',
      companyTaxId: '11.111.111/0001-11',
    })
  })

  it('drops the parent when the EI says the company is not a branch', () => {
    expect(
      companyFieldsOf({
        company: {
          'company-tax-id': '11.111.111/0001-11',
          'parent-company-id': '00000000-0000-4000-8000-0000000000a1',
          'parent-company-name': 'Meridiano Holding',
          'parent-company-tax-id': '22.222.222/0001-22',
          'company-subsidiary': false,
        },
      }),
    ).toEqual({
      parentCompanyId: null,
      parentCompanyName: null,
      companyTaxId: '11.111.111/0001-11',
    })
  })

  /** `company_subsidiary` is a pointer in the EI, so it often arrives absent. */
  it('is a branch, with no flag, when the parent tax id is another company', () => {
    expect(
      companyFieldsOf({
        company: {
          'company-tax-id': '11.111.111/0001-11',
          'parent-company-id': '00000000-0000-4000-8000-0000000000a1',
          'parent-company-name': 'Meridiano Holding',
          'parent-company-tax-id': '22.222.222/0001-22',
        },
      }).parentCompanyId,
    ).toBe('00000000-0000-4000-8000-0000000000a1')
  })

  it('is not a branch, with no flag, when the parent tax id is its own', () => {
    expect(
      companyFieldsOf({
        company: {
          'company-tax-id': '11.111.111/0001-11',
          'parent-company-id': '00000000-0000-4000-8000-0000000000a1',
          'parent-company-name': 'Meridiano Logistica',
          'parent-company-tax-id': '11.111.111/0001-11',
        },
      }).parentCompanyId,
    ).toBeNull()
  })

  it('is not a branch when there is no parent tax id to compare', () => {
    expect(
      companyFieldsOf({
        company: {
          'company-tax-id': '11.111.111/0001-11',
          'parent-company-id': '00000000-0000-4000-8000-0000000000a1',
          'parent-company-name': 'Meridiano Holding',
        },
      }).parentCompanyId,
    ).toBeNull()
  })

  it('reads the company tax id even when the company is its own parent', () => {
    expect(companyFieldsOf({ company: { company_tax_id: '11.111.111/0001-11' } })).toEqual({
      parentCompanyId: null,
      parentCompanyName: null,
      companyTaxId: '11.111.111/0001-11',
    })
  })

  it('reads the keys without depending on case or separator', () => {
    expect(
      companyFieldsOf({
        company: {
          companyTaxId: '11.111.111/0001-11',
          parentCompanyId: '00000000-0000-4000-8000-0000000000a1',
          parentCompanyName: 'Meridiano Holding',
          companySubsidiary: true,
        },
      }),
    ).toEqual({
      parentCompanyId: '00000000-0000-4000-8000-0000000000a1',
      parentCompanyName: 'Meridiano Holding',
      companyTaxId: '11.111.111/0001-11',
    })
  })

  it('falls back to the tax ids when the flag is not a boolean', () => {
    expect(
      companyFieldsOf({
        company: {
          'company-tax-id': '11.111.111/0001-11',
          'parent-company-id': '00000000-0000-4000-8000-0000000000a1',
          'parent-company-name': 'Meridiano Holding',
          'parent-company-tax-id': '11.111.111/0001-11',
          'company-subsidiary': 'true',
        },
      }).parentCompanyId,
    ).toBeNull()
  })

  it('drops a parent whose id is not a uuid, and keeps the ticket creatable', () => {
    expect(
      companyFieldsOf({
        company: {
          'company-tax-id': '11.111.111/0001-11',
          'parent-company-id': 'parent-1',
          'parent-company-name': 'Meridiano Holding',
          'company-subsidiary': true,
        },
      }),
    ).toEqual({
      parentCompanyId: null,
      parentCompanyName: null,
      companyTaxId: '11.111.111/0001-11',
    })
  })

  it('drops the parent name when the id does not come with it', () => {
    expect(
      companyFieldsOf({
        company: {
          'company-tax-id': '11.111.111/0001-11',
          'parent-company-name': 'Meridiano Holding',
          'company-subsidiary': true,
        },
      }),
    ).toEqual({
      parentCompanyId: null,
      parentCompanyName: null,
      companyTaxId: '11.111.111/0001-11',
    })
  })

  it('keeps a parent that came without a name', () => {
    expect(
      companyFieldsOf({
        company: {
          'company-tax-id': '11.111.111/0001-11',
          'parent-company-id': '00000000-0000-4000-8000-0000000000a1',
          'company-subsidiary': true,
        },
      }),
    ).toEqual({
      parentCompanyId: '00000000-0000-4000-8000-0000000000a1',
      parentCompanyName: null,
      companyTaxId: '11.111.111/0001-11',
    })
  })

  it('is all null when there is nothing to read', () => {
    const empty = { parentCompanyId: null, parentCompanyName: null, companyTaxId: null }
    expect(companyFieldsOf({})).toEqual(empty)
    expect(companyFieldsOf({ company: {} })).toEqual(empty)
    expect(companyFieldsOf(null)).toEqual(empty)
    expect(companyFieldsOf('not a snapshot')).toEqual(empty)
  })
})
