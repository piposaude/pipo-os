// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { optionLabel, type LabelContext } from '@/lib/pipodesk/filter-copy'
import type { FilterField } from '@/lib/pipodesk/filter'

/** Twin of the contract block in apps/api/src/modules/tickets/vocabulary.test.ts:
 *  change one, change both. The API declares the words it can put on a row; a
 *  word without copy of its own reaches the analyst raw. */
const WORDS_PATH = fileURLToPath(
  new URL('../../../../../../contract/ticket-vocabulary.json', import.meta.url),
)

const { clientWords } = JSON.parse(readFileSync(WORDS_PATH, 'utf-8')) as {
  clientWords: Record<string, string[]>
}

/** Which filter field reads each vocabulary. */
const FIELD_OF: Record<string, FilterField> = {
  companySize: 'companySizes',
  contractType: 'contractTypes',
}

const ctx: LabelContext = {
  companyName: (id) => id,
  carrierName: (id) => id,
  userName: (id) => id,
}

describe('the client vocabulary the API sends', () => {
  it('should have a field of its own for every vocabulary in the contract', () => {
    expect(Object.keys(clientWords).sort()).toEqual(Object.keys(FIELD_OF).sort())
  })

  it.each(
    Object.entries(clientWords).flatMap(([name, words]) => words.map((word) => [name, word])),
  )('should give %s value "%s" a label of its own', (name, word) => {
    expect(optionLabel(FIELD_OF[name], word, ctx)).not.toBe(word)
  })
})
