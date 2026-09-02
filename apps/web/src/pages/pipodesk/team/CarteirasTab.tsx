import { useMemo, useState } from 'react'
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TextInput,
} from '@piposaude/design-system'
import { membersOf } from '@/lib/pipodesk/permissions'
import type { StructureState } from '@/lib/pipodesk/structure'
import { formatCount } from '@/lib/pipodesk/format'
import type { TicketRow } from '@/lib/pipodesk/ticket-row'
import constants from '@/constants/pages/pipodesk/team'
import styles from './style.module.css'

/**
 * Carteiras tab — the company as the primary noun. Here the row is the company
 * and the question is "who answers for it"; Home is the same relation read
 * from the person's side. Unowned first, always: it is the group's
 * coordination debt. Editing is the rest of PD-105.
 */
export function CarteirasTab({
  structure,
  groupId,
  rows,
  companyName,
  resolveName,
}: {
  structure: StructureState
  groupId: string
  rows: TicketRow[]
  companyName: (id: string) => string
  resolveName: (id: string) => string
}) {
  const [query, setQuery] = useState('')

  /* Two memos on purpose: the tally walks every open ticket of the pod and does
     not depend on the search, so keeping it in the same memo made each
     keystroke re-count thousands of rows to filter twenty companies. */
  const carteira = useMemo(() => {
    const group = structure.groups.find((candidate) => candidate.id === groupId)
    if (!group) return []

    const ownerOf = new Map<string, string>()
    for (const membership of membersOf(structure, groupId)) {
      for (const companyId of membership.companyIds ?? []) {
        ownerOf.set(companyId, membership.userId)
      }
    }

    const abertos = new Map<string, number>()
    for (const row of rows) {
      abertos.set(row.companyId, (abertos.get(row.companyId) ?? 0) + 1)
    }

    return group.companyIds
      .map((companyId) => ({
        id: companyId,
        nome: companyName(companyId),
        dono: ownerOf.get(companyId) ?? null,
        abertos: abertos.get(companyId) ?? 0,
      }))
      .sort((a, b) => {
        // Unowned first; within each half, heaviest load first.
        if ((a.dono === null) !== (b.dono === null)) return a.dono === null ? -1 : 1
        return b.abertos - a.abertos
      })
  }, [structure, groupId, rows, companyName])

  const linhas = useMemo(() => {
    const needle = query.toLowerCase()
    return needle === ''
      ? carteira
      : carteira.filter((linha) => linha.nome.toLowerCase().includes(needle))
  }, [carteira, query])

  return (
    <div className={styles.panel}>
      <div className={styles.search}>
        <TextInput
          label=""
          aria-label={constants.carteiras.search}
          placeholder={constants.carteiras.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <Table hoverable>
        <TableHead>
          <TableRow>
            <TableHeaderCell>{constants.carteiras.company}</TableHeaderCell>
            <TableHeaderCell>{constants.carteiras.owner}</TableHeaderCell>
            <TableHeaderCell align="right">{constants.table.open}</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {linhas.map((linha) => (
            <TableRow key={linha.id}>
              <TableCell>{linha.nome}</TableCell>
              <TableCell>
                {linha.dono === null ? (
                  /* `Badge`, not `Status`: this is a missing configuration, not a ticket
                                       state. */
                  <Badge variant="danger" size="small">
                    {constants.carteiras.rotation}
                  </Badge>
                ) : (
                  resolveName(linha.dono)
                )}
              </TableCell>
              <TableCell align="right">
                <span className={styles.num}>{formatCount(linha.abertos)}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <p className={styles.nota}>{constants.carteiras.editPending}</p>
    </div>
  )
}
