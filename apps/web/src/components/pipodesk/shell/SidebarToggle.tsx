import { IS_MAC } from '@/lib/pipodesk/platform'
import constants from '@/constants/pipodesk/sidebar'
import { useDesk } from './desk-context'
import styles from './SidebarToggle.module.css'

/**
 * The sidebar toggle, beside the breadcrumb of every desk screen. Lives in the
 * header, not the sidebar: there it would vanish on collapse, leaving only the
 * invisible shortcut to bring the menu back. Reads the shell context directly —
 * every header already sits inside it.
 */
export function SidebarToggle() {
  const { sidebarCollapsed, toggleSidebar } = useDesk()
  const label = sidebarCollapsed ? constants.expandSidebar : constants.collapseSidebar

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggleSidebar}
      aria-label={label}
      aria-expanded={!sidebarCollapsed}
      title={`${label} (${IS_MAC ? '⌘B' : 'Ctrl+B'})`}
    >
      {/* Panel-with-left-column glyph, drawn inline: the DS has no sidebar icon
          and the Pipo "new" glyph (same drawing) is 90px away in the tree
          (PD-311). */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M9 3v18" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    </button>
  )
}
