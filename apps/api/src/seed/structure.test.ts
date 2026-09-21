import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ticketFilterSchema } from '../modules/tickets/filter-schema.js'
import { PIPODESK_STRUCTURE, POD_VIEW_NAMES } from './structure.js'

const VIEW_PATH = fileURLToPath(
  new URL('../../../../contract/ticket-queue-view.json', import.meta.url),
)

const { sortFields, sortDirections } = JSON.parse(readFileSync(VIEW_PATH, 'utf-8')) as {
  sortFields: string[]
  sortDirections: string[]
}

const { groups, queues, members } = PIPODESK_STRUCTURE
const root = groups.filter((group) => group.parentKey === null)
const pods = groups.filter((group) => group.parentKey !== null)

describe('the declared Pipodesk structure', () => {
  it('is one root with six pods under it', () => {
    expect(root).toEqual([{ key: 'geben', name: 'Gestão de Benefícios', parentKey: null }])
    expect(pods.map((pod) => pod.name)).toEqual([
      'POD 1',
      'POD 2',
      'POD 3',
      'POD 4',
      'POD 5',
      'POD 6',
    ])
    expect(pods.every((pod) => pod.parentKey === 'geben')).toBe(true)
  })

  it('gives every pod the same four views, and the root none', () => {
    expect(queues).toHaveLength(24)

    for (const pod of pods) {
      const ofPod = queues.filter((queue) => queue.groupKey === pod.key)
      expect(ofPod.map((queue) => queue.name)).toEqual([...POD_VIEW_NAMES])
    }
    expect(queues.filter((queue) => queue.groupKey === 'geben')).toEqual([])
  })

  it('declares only sort values the contract admits', () => {
    for (const queue of queues) {
      expect(sortFields).toContain(queue.sort.by)
      expect(sortDirections).toContain(queue.sort.direction)
    }
  })

  it('declares filters the API would accept', () => {
    for (const queue of queues) {
      expect(() => ticketFilterSchema.parse(queue.filters)).not.toThrow()
    }
  })

  it('puts the same person as admin in the root and in every pod', () => {
    expect(members).toHaveLength(7)
    expect(members.every((member) => member.role === 'admin')).toBe(true)
    expect(new Set(members.map((member) => member.groupKey))).toEqual(
      new Set(groups.map((group) => group.key)),
    )
    expect(new Set(members.map((member) => member.userId))).toEqual(
      new Set(['olavo.souza@piposaude.com.br']),
    )
  })
})
