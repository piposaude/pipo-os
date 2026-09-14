// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DIRECTION_COPY, GROUP_BY_COPY, SORT_COPY } from '@/lib/pipodesk/filter-copy'
import { DEFAULT_SORT, type TicketSort } from '@/lib/pipodesk/sort'

/** Twin of the contract block in apps/api's queues/schema.test.ts: change one,
 *  change both. A value this side gains alone is a 23514 at write time. */
const VIEW_PATH = fileURLToPath(
  new URL('../../../../../../contract/ticket-queue-view.json', import.meta.url),
)

const { sortFields, sortDirections, groupBy, defaultSort } = JSON.parse(
  readFileSync(VIEW_PATH, 'utf-8'),
) as {
  sortFields: string[]
  sortDirections: string[]
  groupBy: string[]
  defaultSort: TicketSort
}

describe('the saved view contract', () => {
  it('should sort by the fields the database accepts, and no others', () => {
    expect(Object.keys(SORT_COPY).sort()).toEqual([...sortFields].sort())
  })

  it('should offer the directions the database accepts, and no others', () => {
    expect(Object.keys(DIRECTION_COPY).sort()).toEqual([...sortDirections].sort())
  })

  it('should group by the values the database accepts, and no others', () => {
    expect(Object.keys(GROUP_BY_COPY).sort()).toEqual([...groupBy].sort())
  })

  it('should open a view the way the column defaults do', () => {
    expect(DEFAULT_SORT).toEqual(defaultSort)
  })
})
