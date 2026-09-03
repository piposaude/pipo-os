import { describe, expect, it } from 'vitest'
import { toClient, toStored, VOCABULARIES } from './vocabulary.js'

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
    expect(toStored('product', 'gym')).toEqual(['gym'])
    expect(toStored('contractType', 'intern')).toEqual(['intern'])
  })

  it('round-trips every mapped value', () => {
    for (const name of ['companySize', 'contractType', 'product'] as const) {
      for (const stored of Object.keys(VOCABULARIES[name])) {
        const client = toClient(name, stored)!
        expect(toStored(name, client)).toContain(stored)
      }
    }
  })
})
