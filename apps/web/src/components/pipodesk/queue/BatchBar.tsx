import { useState, useRef } from 'react'
import { Popover } from '@/components/pipodesk/primitives'
import {
  API_STATUSES,
  FINAL_STATUSES,
  toDisplayStatus,
  type ApiStatus,
} from '@/lib/pipodesk/status'
import { DISPLAY_STATUS_COPY, PENDING_REASON_COPY } from '@/constants/pipodesk/status'
import { formatCount, formatDate } from '@/lib/pipodesk/format'
import styles from './Queue.module.css'

export interface BatchBarProps {
  selectedCount: number
  matchingCount: number
  selectAllMatching: boolean
  onSelectAllMatching: () => void
  onClear: () => void
  analysts: { id: string; name: string }[]
  onAssign: (userId: string | null) => void
  onStatus: (status: ApiStatus) => void
  onSchedule: (actionDate: string) => void
}

type Screen = 'root' | 'assign' | 'status' | 'schedule'

const statusLabel = (status: ApiStatus): string => {
  const display = toDisplayStatus(status)
  const base = DISPLAY_STATUS_COPY[display.status]
  return display.reason ? `${base} · ${PENDING_REASON_COPY[display.reason]}` : base
}

/**
 * Batch bar: the compact pill (count · Ações · ×) pinned to the bottom, shown
 * only while something is selected. "Select all N matching" sits on top,
 * separated: it changes the selection's scope, not the selection — and the
 * number is literal.
 *
 * Absent, not disabled — a grayed item with no visible reason only frustrates:
 * comment and complete (PD-040/PD-031) and move-to-pod (PD-052).
 */
export function BatchBar({
  selectedCount,
  matchingCount,
  selectAllMatching,
  onSelectAllMatching,
  onClear,
  analysts,
  onAssign,
  onStatus,
  onSchedule,
}: BatchBarProps) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const [screen, setScreen] = useState<Screen>('root')
  const [date, setDate] = useState('')

  if (selectedCount === 0) return null

  const effective = selectAllMatching ? matchingCount : selectedCount
  const podeSelecionarTodos = !selectAllMatching && matchingCount > selectedCount

  const close = () => {
    setOpen(false)
    setScreen('root')
    setDate('')
  }

  const act = (run: () => void) => {
    run()
    close()
  }

  const item = (label: string, onClick: () => void, key?: string) => (
    <button key={key ?? label} type="button" className={styles.panelItem} onClick={onClick}>
      {label}
    </button>
  )

  return (
    <div className={styles.batchbar}>
      <div className={styles.batchPill} role="group" aria-label="Ações em lote">
        <span className={styles.batchCount}>
          <strong className={styles.num}>{formatCount(effective)}</strong>{' '}
          {effective === 1 ? 'selecionado' : 'selecionados'}
        </span>

        <span className={styles.batchAnchor}>
          <button
            type="button"
            ref={trigger}
            className={styles.batchAction}
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            Ações
          </button>
          <Popover
            open={open}
            onClose={close}
            label="Ações em lote"
            align="right"
            side="top"
            anchor={trigger}
          >
            <div className={styles.panelBody}>
              {screen === 'root' && (
                <>
                  {podeSelecionarTodos && (
                    <>
                      {item(
                        `Selecionar todos os ${formatCount(matchingCount)} que casam o filtro`,
                        () => act(onSelectAllMatching),
                      )}
                      <hr className={styles.panelSep} />
                    </>
                  )}
                  {item('Reatribuir', () => setScreen('assign'))}
                  {item('Mudar status', () => setScreen('status'))}
                  {item('Agendar', () => setScreen('schedule'))}
                </>
              )}

              {screen === 'assign' && (
                <>
                  <div className={styles.panelHead}>
                    <button
                      type="button"
                      className={styles.panelBack}
                      onClick={() => setScreen('root')}
                    >
                      Voltar
                    </button>
                    <span>Reatribuir</span>
                  </div>
                  {item('Remover atribuição', () => act(() => onAssign(null)))}
                  {analysts.map((analyst) =>
                    item(analyst.name, () => act(() => onAssign(analyst.id)), analyst.id),
                  )}
                </>
              )}

              {screen === 'status' && (
                <>
                  <div className={styles.panelHead}>
                    <button
                      type="button"
                      className={styles.panelBack}
                      onClick={() => setScreen('root')}
                    >
                      Voltar
                    </button>
                    <span>Mudar status</span>
                  </div>
                  {/* No FINAL status: both close the ticket, and closing goes through
                                         the gates (PD-031). */}
                  {API_STATUSES.filter((status) => !FINAL_STATUSES.includes(status)).map((status) =>
                    item(statusLabel(status), () => act(() => onStatus(status)), status),
                  )}
                </>
              )}

              {screen === 'schedule' && (
                <>
                  <div className={styles.panelHead}>
                    <button
                      type="button"
                      className={styles.panelBack}
                      onClick={() => setScreen('root')}
                    >
                      Voltar
                    </button>
                    <span>Agendar</span>
                  </div>
                  <input
                    type="date"
                    aria-label="Data da ação"
                    className={styles.panelSearch}
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                  <button
                    type="button"
                    className={styles.panelItem}
                    disabled={date === ''}
                    onClick={() => act(() => onSchedule(date))}
                  >
                    Agendar para {date === '' ? '—' : formatDate(date)}
                  </button>
                </>
              )}
            </div>
          </Popover>
        </span>

        <button
          type="button"
          className={styles.batchClear}
          aria-label="Limpar seleção"
          onClick={onClear}
        >
          ×
        </button>
      </div>
    </div>
  )
}
