import { useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { client } from '@/lib/api'
import type { ApiGroup, ApiGroupMember } from '@/lib/pipodesk/structure-from-api'
import type { MemberRole } from '@/lib/pipodesk/structure'

export const GROUPS_KEY = ['get', '/api/groups', 'all']

export interface NewMembership {
  groupId: string
  userId: string
  role: MemberRole
}

export interface GroupWrites {
  addMembers: (memberships: NewMembership[]) => void
  setMemberRole: (groupId: string, userId: string, role: MemberRole) => void
  removeMember: (groupId: string, userId: string) => void
}

/**
 * Structure writes, optimistic over the groups cache. A refusal undoes only
 * the line it touched — restoring a whole snapshot would also undo a write
 * that landed in between — and every write ends in a re-read.
 */
export function useGroupWrites(onFail: () => void): GroupWrites {
  const queryClient = useQueryClient()

  return useMemo(() => {
    const members = (groupId: string) =>
      queryClient.getQueryData<ApiGroup[]>(GROUPS_KEY)?.find((group) => group.id === groupId)
        ?.members ?? []

    const editMembers = (groupId: string, edit: (current: ApiGroupMember[]) => ApiGroupMember[]) =>
      queryClient.setQueryData<ApiGroup[]>(GROUPS_KEY, (current) =>
        current?.map((group) =>
          group.id === groupId ? { ...group, members: edit(group.members) } : group,
        ),
      )

    const write = (apply: () => void, request: () => Promise<unknown>, undo: () => void) => {
      void (async () => {
        await queryClient.cancelQueries({ queryKey: GROUPS_KEY })
        apply()
        try {
          await request()
        } catch {
          undo()
          onFail()
        }
        await queryClient.invalidateQueries({ queryKey: GROUPS_KEY })
      })()
    }

    const path = (groupId: string, userId: string) => ({
      params: { path: { id: groupId, memberId: userId } },
    })

    return {
      addMembers: (memberships) => {
        void (async () => {
          await queryClient.cancelQueries({ queryKey: GROUPS_KEY })
          for (const { groupId, userId, role } of memberships) {
            editMembers(groupId, (current) => [
              ...current,
              { userId, role, active: true, companyIds: [] },
            ])
          }
          const results = await Promise.allSettled(
            memberships.map(({ groupId, userId, role }) =>
              client.POST('/api/groups/{id}/members', {
                params: { path: { id: groupId } },
                body: { userId, role },
              }),
            ),
          )
          const refused = memberships.filter((_, index) => results[index].status === 'rejected')
          for (const { groupId, userId } of refused) {
            editMembers(groupId, (current) => current.filter((member) => member.userId !== userId))
          }
          if (refused.length > 0) onFail()
          await queryClient.invalidateQueries({ queryKey: GROUPS_KEY })
        })()
      },

      setMemberRole: (groupId, userId, role) => {
        const previous = members(groupId).find((member) => member.userId === userId)?.role
        const withRole = (to: MemberRole) => (current: ApiGroupMember[]) =>
          current.map((member) => (member.userId === userId ? { ...member, role: to } : member))
        write(
          () => editMembers(groupId, withRole(role)),
          () =>
            client.PATCH('/api/groups/{id}/members/{memberId}', {
              ...path(groupId, userId),
              body: { role },
            }),
          () => {
            if (previous !== undefined) editMembers(groupId, withRole(previous))
          },
        )
      },

      removeMember: (groupId, userId) => {
        const before = members(groupId)
        const at = before.findIndex((member) => member.userId === userId)
        write(
          () =>
            editMembers(groupId, (current) => current.filter((member) => member.userId !== userId)),
          () => client.DELETE('/api/groups/{id}/members/{memberId}', path(groupId, userId)),
          () => {
            if (at === -1) return
            editMembers(groupId, (current) =>
              current.some((member) => member.userId === userId)
                ? current
                : [...current.slice(0, at), before[at], ...current.slice(at)],
            )
          },
        )
      },
    }
  }, [queryClient, onFail])
}
