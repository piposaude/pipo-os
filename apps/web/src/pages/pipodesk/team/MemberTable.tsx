import { useMemo, useState } from 'react'
import {
  Avatar,
  Badge,
  Icon,
  PopoverMenu,
  PopoverMenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@piposaude/design-system'
import { Link } from '@tanstack/react-router'
import { DeskIcon } from '@/components/pipodesk/icons'
import { initialsOf } from '@/lib/pipodesk/format'
import {
  membersWithLoad,
  operationRoster,
  type MemberLoad,
  type RosterLine,
} from '@/lib/pipodesk/team'
import type { Group, MemberRole, StructureState } from '@/lib/pipodesk/structure'
import type { TicketRow } from '@/lib/pipodesk/ticket-row'
import constants from '@/constants/pages/pipodesk/team'
import styles from './style.module.css'

export interface MemberTableProps {
  group: Group
  isRoot: boolean
  structure: StructureState
  /** Awake open work: the pod's own in a pod, every pod's at the root. */
  rows: TicketRow[]
  resolveName: (userId: string) => string
  /** Coordination of this pod or above. Without it the row has no menu at all. */
  canEdit: boolean
  onSetRole: (userId: string, role: MemberRole) => void
  onRemove: (userId: string) => void
}

function RowActions({
  name,
  role,
  onSetRole,
  onRemove,
}: {
  name: string
  role: MemberRole
  onSetRole: (role: MemberRole) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return (
    <PopoverMenu
      isOpen={open}
      onClose={close}
      placement="bottom-end"
      trigger={
        <button
          type="button"
          className={styles.rowMenu}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={constants.rowMenu.trigger(name)}
          onClick={() => setOpen((current) => !current)}
        >
          <DeskIcon name="more" size={16} />
        </button>
      }
    >
      <PopoverMenuItem
        onClick={() => {
          close()
          onSetRole(role === 'admin' ? 'member' : 'admin')
        }}
      >
        {role === 'admin' ? constants.rowMenu.makeMember : constants.rowMenu.makeAdmin}
      </PopoverMenuItem>
      <PopoverMenuItem
        destructive
        onClick={() => {
          close()
          onRemove()
        }}
      >
        {constants.rowMenu.remove}
      </PopoverMenuItem>
    </PopoverMenu>
  )
}

/**
 * The people of a team. In a pod, one line per membership; at the root, one
 * line per person of the operation, with the Pod column — the root's own
 * memberships are only coordination.
 */
export function MemberTable({
  group,
  isRoot,
  structure,
  rows,
  resolveName,
  canEdit,
  onSetRole,
  onRemove,
}: MemberTableProps) {
  /* At the root a person has several memberships: the pod is a link, and the
     edits live on its page, where the membership is one. */
  const withActions = canEdit && !isRoot

  const lines = useMemo<(MemberLoad & Partial<RosterLine>)[]>(
    () =>
      isRoot
        ? operationRoster(structure, rows, resolveName)
        : membersWithLoad(structure, group.id, rows),
    [isRoot, structure, rows, resolveName, group.id],
  )

  if (lines.length === 0) {
    return (
      <div className={styles.empty}>
        <p>{constants.empty.title(group.name)}</p>
        <p>{canEdit ? constants.empty.canEdit : constants.empty.cannotEdit}</p>
      </div>
    )
  }

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>{constants.table.person}</TableHeaderCell>
          <TableHeaderCell>{constants.table.role}</TableHeaderCell>
          {isRoot && <TableHeaderCell>{constants.table.pod}</TableHeaderCell>}
          <TableHeaderCell>{constants.table.portfolio}</TableHeaderCell>
          <TableHeaderCell align="right">{constants.table.open}</TableHeaderCell>
          {withActions && <TableHeaderCell aria-label={constants.table.actions} />}
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
                {member.coordinatesOperation ? (
                  <span className={styles.muted}>{constants.allPods}</span>
                ) : (
                  <span className={styles.pods}>
                    {member.pods?.map((pod) => (
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
            {withActions && (
              <TableCell align="right">
                <RowActions
                  name={resolveName(member.userId)}
                  role={member.role}
                  onSetRole={(role) => onSetRole(member.userId, role)}
                  onRemove={() => onRemove(member.userId)}
                />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
