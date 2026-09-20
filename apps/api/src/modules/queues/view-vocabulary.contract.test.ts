import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SORT, GROUP_BY_VALUES, SORT_DIRECTIONS, SORT_FIELDS } from './view-vocabulary.js'

const VIEW_PATH = fileURLToPath(
  new URL('../../../../../contract/ticket-queue-view.json', import.meta.url),
)

const contract = JSON.parse(readFileSync(VIEW_PATH, 'utf-8')) as {
  sortFields: string[]
  sortDirections: string[]
  groupBy: string[]
  defaultSort: { by: string; direction: string }
}

describe('the saved view vocabulary', () => {
  it('names the same sort fields the contract does', () => {
    expect([...SORT_FIELDS]).toEqual(contract.sortFields)
  })

  it('names the same sort directions the contract does', () => {
    expect([...SORT_DIRECTIONS]).toEqual(contract.sortDirections)
  })

  it('names the same grouping the contract does', () => {
    expect([...GROUP_BY_VALUES]).toEqual(contract.groupBy)
  })

  it('starts a view on the sort the contract calls default', () => {
    expect(DEFAULT_SORT).toEqual(contract.defaultSort)
  })
})
