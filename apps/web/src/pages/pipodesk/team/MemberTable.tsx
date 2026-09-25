import { useMemo } from 'react'
import {
  Avatar,
  Badge,
  Icon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@piposaude/design-system'
import { Link } from '@tanstack/react-router'
import { membersWithLoad, operationRoster, type RosterLine } from '@/lib/pipodesk/team'
import type { Group, StructureState } from '@/lib/pipodesk/structure'
import type { TicketRow } from '@/lib/pipodesk/ticket-row'
import constants from '@/constants/pages/pipodesk/team'
import styles from './style.module.css'

/** Up to two initials for the avatar, from the first two words of the name. */
const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

export interface MemberTableProps {
  group: Group
  isRoot: boolean
  structure: StructureState
  /** Awake open work: the pod's own in a pod, every pod's at the root. */
  rows: TicketRow[]
  resolveName: (userId: string) => string
}

/**
 * The people of a team. In a pod, one line per membership; at the root, one
 * line per person of the operation, with the Pod column — the root's own
 * memberships are only coordination.
 */
export function MemberTable({ group, isRoot, structure, rows, resolveName }: MemberTableProps) {
  const lines = useMemo<RosterLine[]>(
    () =>
      isRoot
        ? operationRoster(structure, rows, resolveName)
        : membersWithLoad(structure, group.id, rows).map((line) => ({ ...line, pods: [] })),
    [isRoot, structure, rows, resolveName, group.id],
  )

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>{constants.table.person}</TableHeaderCell>
          <TableHeaderCell>{constants.table.role}</TableHeaderCell>
          {isRoot && <TableHeaderCell>{constants.table.pod}</TableHeaderCell>}
          <TableHeaderCell>{constants.table.portfolio}</TableHeaderCell>
          <TableHeaderCell align="right">{constants.table.open}</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {lines.map((member) => (
          <TableRow key={member.userId}>
            <TableCell>
              <span className={styles.person}>
                {/* alt="" on purpose: the name renders next to it in the same cell — an
                    alt would read the person twice. The queue's owner column is the
                    opposite: there the avatar is alone. */}
                <Avatar size="sm" text={initialsOf(resolveName(member.userId))} alt="" />
                {resolveName(member.userId)}
              </span>
            </TableCell>
            <TableCell>
              {/* `tertiary`, not `primary`: solid green with light text reads as a
                  button, not an attribute, in a 20px badge. */}
              <Badge variant={member.role === 'admin' ? 'tertiary' : 'neutral'} size="small">
                {constants.roles[member.role]}
              </Badge>
            </TableCell>
            {isRoot && (
              <TableCell>
                {member.role === 'admin' ? (
                  <span className={styles.muted}>{constants.allPods}</span>
                ) : (
                  <span className={styles.pods}>
                    {member.pods.map((pod) => (
                      <Link key={pod.id} to="/teams/$groupId" params={{ groupId: pod.id }}>
                        {pod.name}
                      </Link>
                    ))}
                  </span>
                )}
              </TableCell>
            )}
            {/* Coordination without portfolio is "not applicable", not zero — a `0`
                would read as an empty portfolio to fill. */}
            <TableCell>
              {member.companies === 0 && member.role === 'admin' ? (
                <span className={styles.muted}>{constants.noPortfolio}</span>
              ) : (
                <span className={styles.portfolio}>
                  {constants.portfolio(member.companies)}
                  {member.shared > 0 && (
                    <span className={styles.shared} title={constants.shared(member.shared)}>
                      <Icon name="fill/alert" size="xs" />
                      {member.shared}
                      <span className={styles.srOnly}>{constants.shared(member.shared)}</span>
                    </span>
                  )}
                </span>
              )}
            </TableCell>
            <TableCell align="right" className={styles.num}>
              {member.open}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
