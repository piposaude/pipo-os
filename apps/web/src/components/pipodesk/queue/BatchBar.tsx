import { useState, useRef } from 'react'
import { Popover } from '@/components/pipodesk/primitives'
import { API_STATUSES, toDisplayStatus, type ApiStatus } from '@/lib/pipodesk/status'
import { DISPLAY_STATUS_COPY, PENDING_REASON_COPY } from '@/constants/pipodesk/status'
import { formatCount } from '@/lib/pipodesk/format'
import styles from './Queue.module.css'

/** A pod and its analysts, for "move to portfolio". Built by whoever holds
 *  the structure — an action bar is no place to derive the org. */
export interface PodOption {
  id: string
  name: string
  analysts: { id: string; name: string }[]
}

export interface BatchBarProps {
  selectedCount: number
  matchingCount: number
  selectAllMatching: boolean
  onSelectAllMatching: () => void
  onClear: () => void
  analysts: { id: string; name: string }[]
  onAssign: (userId: string | null) => void
  pods: PodOption[]
  onMoveToPod: (groupId: string, userId: string | null) => void
  onStatus: (status: ApiStatus) => void
  onSchedule: (date: string | null) => void
}

type Screen = 'root' | 'assign' | 'move' | 'status' | 'schedule' | { pod: PodOption }

const statusLabel = (status: ApiStatus): string => {
  const display = toDisplayStatus(status)
  const base = DISPLAY_STATUS_COPY[display.status]
  return display.reason ? `${base} · ${PENDING_REASON_COPY[display.reason]}` : base
}

/**
 * Batch bar: the compact pill (count · Ações · ×) pinned to the bottom, shown
 * only while something is selected. "Select all N matching" sits on top,
 * separated: it changes the selection's scope, not the selection — and the
 * number is literal. Comment/complete are absent (PD-040/PD-031), not
 * disabled: a grayed menu item with no visible reason only frustrates.
 */
export function BatchBar({
  selectedCount,
  matchingCount,
  selectAllMatching,
  onSelectAllMatching,
  onClear,
  analysts,
  onAssign,
  pods,
  onMoveToPod,
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
                  {pods.length > 0 && item('Mover para carteira', () => setScreen('move'))}
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

              {screen === 'move' && (
                <>
                  <div className={styles.panelHead}>
                    <button
                      type="button"
                      className={styles.panelBack}
                      onClick={() => setScreen('root')}
                    >
                      Voltar
                    </button>
                    <span>Mover para carteira</span>
                  </div>
                  {pods.map((pod) => item(pod.name, () => setScreen({ pod }), pod.id))}
                </>
              )}

              {typeof screen === 'object' && (
                <>
                  <div className={styles.panelHead}>
                    <button
                      type="button"
                      className={styles.panelBack}
                      onClick={() => setScreen('move')}
                    >
                      Voltar
                    </button>
                    <span>{screen.pod.name}</span>
                  </div>
                  {/* `null` = arrives free in the receiving pod — its rotation decides. */}
                  {item(`Livre em ${screen.pod.name}`, () =>
                    act(() => onMoveToPod(screen.pod.id, null)),
                  )}
                  {screen.pod.analysts.map((analyst) =>
                    item(
                      analyst.name,
                      () => act(() => onMoveToPod(screen.pod.id, analyst.id)),
                      analyst.id,
                    ),
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
                  {/* `completed` is out: closing goes through the gates (PD-031); a batch
                                         that closes unvalidated is the exact defect gates exist
                                         to prevent. */}
                  {API_STATUSES.filter((status) => status !== 'completed').map((status) =>
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
                    Agendar para {date || '—'}
                  </button>
                  {item('Remover agendamento', () => act(() => onSchedule(null)))}
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
