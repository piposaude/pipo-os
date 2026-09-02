import { Icon, type IconName } from '@piposaude/design-system'
import { DeskIcon } from '@/components/pipodesk/icons'
import type { SidebarIconKind } from './sidebar-icon-kind'
import styles from './QueueSidebar.module.css'

/**
 * Row glyphs (from the prototype): four from the DS, six from the Pipo set the
 * DS has not published (PD-311). Always decorative — the label says it all.
 */
const FROM_DS: Partial<Record<SidebarIconKind, IconName>> = {
  urgent: 'fill/warning',
  waiting: 'fill/hourglass',
  resolved: 'fill/success',
  cancelled: 'fill/close-circle',
}

const FROM_PIPODESK: Partial<Record<SidebarIconKind, string>> = {
  inbox: 'inbox',
  'my-tickets': 'ticket',
  new: 'new',
  geben: 'network',
  group: 'cube',
}

export function SidebarIcon({ kind }: { kind: SidebarIconKind }) {
  const fromDs = FROM_DS[kind]
  const local = FROM_PIPODESK[kind]
  return (
    <span className={styles.icon} data-icon={kind}>
      {fromDs ? <Icon name={fromDs} size="sm" /> : local ? <DeskIcon name={local} /> : null}
    </span>
  )
}
