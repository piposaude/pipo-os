import { useMemo } from 'react'
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@piposaude/design-system'
import { applyFilter, valuesOf, type FilterField, type TicketFilter } from '@/lib/pipodesk/filter'
import {
  FILTER_FIELDS,
  FILTER_FIELD_COPY,
  optionLabel,
  type LabelContext,
} from '@/lib/pipodesk/filter-copy'
import { formatCount } from '@/lib/pipodesk/format'
import { queuesOf, type StructureState } from '@/lib/pipodesk/structure'
import type { TicketRow } from '@/lib/pipodesk/ticket-row'
import constants from '@/constants/pages/pipodesk/team'
import styles from './style.module.css'

/** A view's criterion in pt-BR, built from the same tables the filter panel
 *  and chips use — the three say the same thing. */
const criterioDe = (filter: TicketFilter, ctx: LabelContext): string =>
  FILTER_FIELDS.flatMap((campo: FilterField) => {
    const valores = valuesOf(filter, campo)
    if (!valores?.length) return []
    const rotulos = valores.map((valor) => optionLabel(campo, valor, ctx))
    return [`${FILTER_FIELD_COPY[campo]}: ${rotulos.join(', ')}`]
  }).join(' · ')

/**
 * Views tab — the team's saved cuts with each one's POLICY visible. A saved
 * view carries how a ticket finds its person; the policy is read, not edited
 * — the spec names `assignment_mode` without listing values, and offering a
 * selector would invent domain vocabulary.
 */
export function ViewsTab({
  structure,
  groupId,
  rows,
  ctx,
}: {
  structure: StructureState
  groupId: string
  rows: TicketRow[]
  ctx: LabelContext
}) {
  const linhas = useMemo(
    () =>
      queuesOf(structure, groupId).map((queue) => ({
        id: queue.id,
        nome: queue.name,
        criterio: criterioDe(queue.filter, ctx) || constants.views.noFilter,
        abertos: applyFilter(rows, queue.filter, '').length,
      })),
    [structure, groupId, rows, ctx],
  )

  return (
    <div className={styles.panel}>
      <p className={styles.nota}>{constants.views.intro}</p>

      <Table hoverable>
        <TableHead>
          <TableRow>
            <TableHeaderCell>{constants.views.name}</TableHeaderCell>
            <TableHeaderCell>{constants.views.criterion}</TableHeaderCell>
            <TableHeaderCell>{constants.views.policy}</TableHeaderCell>
            <TableHeaderCell align="right">{constants.table.open}</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {linhas.map((linha) => (
            <TableRow key={linha.id}>
              <TableCell>{linha.nome}</TableCell>
              <TableCell>
                <span className={styles.criterio}>{linha.criterio}</span>
              </TableCell>
              {/* Every cut distributes the same way today: by company owner. Rotation is
                                 what matches no portfolio. */}
              <TableCell>{constants.views.byOwner}</TableCell>
              <TableCell align="right">
                <span className={styles.num}>{formatCount(linha.abertos)}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className={`${styles.pendencia} ${styles.pendenciaAberta}`}>
        <div className={styles.pendenciaTexto}>
          <strong>
            <Badge variant="neutral" size="small">
              {constants.views.undefinedBadge}
            </Badge>{' '}
            {constants.views.policyPendingTitle}
          </strong>
          <span>{constants.views.policyPendingBody}</span>
        </div>
      </div>
    </div>
  )
}
