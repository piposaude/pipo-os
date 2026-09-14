import { describe, expect, it } from 'vitest'
import { ValidationFailedError } from '../../shared/errors.js'
import { assertParentIsValid, type GroupNode } from './hierarchy.js'

const node = (id: string, parentId: string | null = null): GroupNode => ({ id, parentId })

/** `null` when the parent is accepted, otherwise the refusal code. */
function refusalOf(nodes: readonly GroupNode[], parentId: string | null, groupId?: string) {
  try {
    assertParentIsValid(nodes, parentId, groupId)
    return null
  } catch (err) {
    if (err instanceof ValidationFailedError) return err.details?.[0].code
    throw err
  }
}

const GEBEN = node('geben')
const POD_3 = node('pod-3', 'geben')
const POD_5 = node('pod-5', 'geben')
const SUBTIME = node('subtime', 'pod-3')

describe('the shape of the group hierarchy', () => {
  describe('the single root', () => {
    it('accepts the first group of an empty tree as the root', () => {
      expect(refusalOf([], null)).toBeNull()
    })

    it('refuses a second root', () => {
      expect(refusalOf([GEBEN], null)).toBe('root_already_exists')
    })

    it('lets the group that already is the root go on being it', () => {
      expect(refusalOf([GEBEN], null, 'geben')).toBeNull()
    })
  })

  describe('the parent', () => {
    it('refuses a parent that is not in the tree', () => {
      expect(refusalOf([GEBEN], 'pod-3')).toBe('parent_not_found')
    })

    it('refuses the group itself', () => {
      expect(refusalOf([GEBEN, POD_3], 'pod-3', 'pod-3')).toBe('parent_is_descendant')
    })

    it('refuses a descendant, which would close a cycle', () => {
      expect(refusalOf([GEBEN, POD_3, SUBTIME], 'subtime', 'geben')).toBe('parent_is_descendant')
    })
  })

  describe('the three levels', () => {
    it('accepts the third level', () => {
      expect(refusalOf([GEBEN, POD_3], 'pod-3')).toBeNull()
    })

    it('refuses the fourth', () => {
      expect(refusalOf([GEBEN, POD_3, SUBTIME], 'subtime')).toBe('max_depth_exceeded')
    })

    it('counts the children of the group being moved, not the group alone', () => {
      const tree = [GEBEN, POD_3, POD_5, SUBTIME]

      expect(refusalOf(tree, 'pod-5', 'pod-3')).toBe('max_depth_exceeded')
      expect(refusalOf(tree, 'pod-5', 'subtime')).toBeNull()
    })
  })

  /* The API refuses every cycle, so one only gets in through a write straight
     to the table — which is the case MAX_DEPTH bounds the walks for. Drop that
     bound and these spin forever, and the request never answers. */
  describe('a cycle already written into the table', () => {
    const cycle = [node('a', 'b'), node('b', 'a')]

    it('refuses instead of spinning, walking up the parents and down the children', () => {
      expect(refusalOf(cycle, 'a')).toBe('max_depth_exceeded')
      expect(refusalOf([node('r'), ...cycle], 'r', 'a')).toBe('max_depth_exceeded')
    })

    it('still finds the group among its own ancestors', () => {
      expect(refusalOf(cycle, 'a', 'b')).toBe('parent_is_descendant')
    })
  })
})
