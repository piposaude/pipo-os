import { describe, expect, it } from 'vitest'
import { toClient, toStored } from './vocabulary.js'

describe('toClient', () => {
  it('translates each stored value the EI can send', () => {
    expect(toClient('companySize', 'smb')).toBe('pme')
    expect(toClient('companySize', 'corporate')).toBe('enterprise')
    expect(toClient('contractType', 'services-contract')).toBe('pj')
    expect(toClient('product', 'pet-insurance')).toBe('pet')
  })

  it('passes an unmapped value through instead of blanking it', () => {
    expect(toClient('product', 'mental-health')).toBe('mental-health')
    expect(toClient('contractType', 'intern')).toBe('intern')
  })

  it('keeps null as null', () => {
    expect(toClient('companySize', null)).toBeNull()
  })

  it('does not read a value off Object.prototype', () => {
    expect(toClient('product', 'constructor')).toBe('constructor')
  })
})

describe('toStored', () => {
  it('finds the stored value behind a client word', () => {
    expect(toStored('companySize', 'pme')).toContain('smb')
    expect(toStored('contractType', 'pj')).toContain('services-contract')
  })

  it('matches both forms of a product', () => {
    expect(toStored('product', 'health').sort()).toEqual(['health', 'health-insurance'])
  })

  it('falls back to the value itself when nothing maps to it', () => {
    expect(toStored('contractType', 'intern')).toEqual(['intern'])
  })

  /** The point of the rule: a benefit the EI adds tomorrow needs no entry here
   *  to be found by either of its names. */
  it('finds both names of a benefit nobody registered', () => {
    expect(toClient('product', 'travel-insurance')).toBe('travel')
    expect(toStored('product', 'travel').sort()).toEqual(['travel', 'travel-insurance'])
  })

  it('round-trips every value either vocabulary can receive', () => {
    const stored = {
      companySize: ['smb', 'smb-plus', 'corporate'],
      contractType: ['brazil-labor-law', 'services-contract', 'partner', 'intern'],
      product: ['health', 'health-insurance', 'pet-insurance', 'gym', 'mental-health'],
    } as const

    for (const name of ['companySize', 'contractType', 'product'] as const) {
      for (const value of stored[name]) {
        expect(toStored(name, toClient(name, value)!)).toContain(value)
      }
    }
  })
})
