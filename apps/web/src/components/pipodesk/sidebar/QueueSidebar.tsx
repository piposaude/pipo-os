import { useState, type CSSProperties, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { Badge, Button, Text } from '@piposaude/design-system'
import { PipoOsWordmark } from '@/components/pipodesk/shell/PipoOsWordmark'
import { Popover } from '@/components/pipodesk/primitives'
import constants from '@/constants/pipodesk/sidebar'
import { formatCount, shortSidebarLabel } from '@/lib/pipodesk/format'
import type { StructureState } from '@/lib/pipodesk/structure'
import type { TreeNode, TreeSection } from '@/lib/pipodesk/tree'
import { SidebarIcon } from './SidebarIcon'
import { sidebarIconKindFor } from './sidebar-icon-kind'
import styles from './QueueSidebar.module.css'

/**
 * The Pipodesk navigation tree (ported from the prototype). Three rules that
 * look like detail and are not: (1) a group row never navigates — it expands;
 * the child "Chamados" opens the list; (2) subteams do not collapse with the
 * group's items; (3) containers draw no count — a number the click cannot
 * open is a broken promise. Missing: inline rename, row menu, favorite star
 * (PD-104/105).
 */

export interface QueueSidebarProps {
  sections: TreeSection[]
  activeId: string
  onSelect: (node: TreeNode) => void
  structure: StructureState
  /** Viewer initials for the footer. */
  viewerInitials: string
  viewerName: string
  viewerEmail: string
  onLogout: () => void
  onOpenSearch: () => void
  /** Hidden, not unmounted: which nodes are open is local state, and the tree
   *  would reopen at the default after every ⌘B. */
  collapsed?: boolean
}

/** The three team-page destinations. Glyphs drawn inline — the DS lacks
 *  them (PD-311). */
const ADMIN_LINKS = [
  {
    key: 'home',
    label: 'Home',
    glyph: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M2.5 6.8 8 2.5l5.5 4.3V13a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V6.8Z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path d="M6.5 13.5v-4h3v4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'portfolios',
    label: 'Carteiras',
    glyph: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect
          x="2"
          y="5"
          width="12"
          height="8.5"
          rx="1.2"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path
          d="M6 5V3.8c0-.4.3-.8.8-.8h2.4c.5 0 .8.4.8.8V5"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path d="M2 8.5h12" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
  },
  {
    key: 'views',
    label: 'Views',
    glyph: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <circle
          cx="6"
          cy="4.5"
          r="1.4"
          fill="var(--pipo-surface)"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <circle
          cx="10.5"
          cy="8"
          r="1.4"
          fill="var(--pipo-surface)"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <circle
          cx="5"
          cy="11.5"
          r="1.4"
          fill="var(--pipo-surface)"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      </svg>
    ),
  },
] as const

const groupOfNode = (nodeId: string, structure: StructureState) =>
  structure.groups.find((group) => `node-${group.id}` === nodeId)

function Node({
  node,
  activeId,
  onSelect,
  structure,
}: {
  node: TreeNode
  activeId: string
  onSelect: (node: TreeNode) => void
  structure: StructureState
}) {
  const style = { '--depth': node.depth } as CSSProperties
  const isActive = node.id === activeId
  const nodeGroup = groupOfNode(node.id, structure)
  /** GEBEN is depth 0, so not a container: clicking opens the whole queue
   *  (the merge with the old "Todos" view). */
  const isContainer = nodeGroup !== undefined && node.depth > 0

  /** Only "Meus tickets" opens by default — GEBEN open would push the
   *  analyst's daily section off screen. */
  const [open, setOpen] = useState(() => node.depth <= 0 && nodeGroup === undefined)

  const activate = () => {
    if (isContainer) {
      setOpen((current) => !current)
      return
    }
    onSelect(node)
  }

  const iconKind = sidebarIconKindFor(node)
  const iconAndLabel = (
    <>
      {iconKind && <SidebarIcon kind={iconKind} />}
      {/* `title` keeps the full name, never the short one — hover shows the whole
                 label. */}
      <span className={styles.label} title={node.label}>
        {shortSidebarLabel(node.label)}
      </span>
    </>
  )

  if (node.children.length === 0) {
    const isInbox = node.id === 'node-inbox'
    return (
      <button
        type="button"
        className={isInbox ? `${styles.item} ${styles.surface}` : styles.item}
        style={style}
        aria-current={isActive ? 'page' : undefined}
        onClick={activate}
      >
        {iconAndLabel}
        {isInbox ? (
          node.count > 0 ? (
            <Badge variant="danger" size="small" className={styles.badge}>
              {node.count}
            </Badge>
          ) : null
        ) : (
          <span className={styles.count}>{formatCount(node.count)}</span>
        )}
      </button>
    )
  }

  /** Children in the always-visible band (subteams + `structural` nodes like
   *  triage/future) vs the node's own items. Group derivation first, so a
   *  runtime subteam joins the band unmarked. */
  const subGroups = node.children.filter(
    (child) => groupOfNode(child.id, structure) !== undefined || child.structural,
  )
  const items = node.children.filter((child) => !subGroups.includes(child))

  return (
    <div className={node.crossCut ? styles.crossCut : undefined} style={style}>
      {/* Chevron and label are siblings — button-in-button is invalid HTML. The
                 row owns selection; the chevron stops propagation to only toggle. */}
      <div className={styles.row} style={style} onClick={activate}>
        <button
          type="button"
          className={`${styles.item} ${styles.branch}`}
          aria-current={isContainer || !isActive ? undefined : 'page'}
        >
          {iconAndLabel}
        </button>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          aria-label={`${open ? 'Recolher' : 'Expandir'} ${node.label}`}
          onClick={(event) => {
            event.stopPropagation()
            setOpen((current) => !current)
          }}
        >
          <svg
            className={styles.chevron}
            width="12"
            height="12"
            viewBox="0 0 12 12"
            aria-hidden="true"
          >
            <path
              d="M4.5 2.5 8 6l-3.5 3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {isContainer ? null : <span className={styles.count}>{formatCount(node.count)}</span>}
      </div>

      {/* The group's admin links. Deliberately NOT TreeNodes: a node without
                 filter or count would break the count-equals-list invariant. */}
      {open && nodeGroup !== undefined && (
        <div className={styles.children} style={style}>
          {/* `Link`, not button+navigate: real navigation gives ⌘-click and
                         open-in-new-tab for free. */}
          {ADMIN_LINKS.map(({ key, label, glyph }) => (
            /* The three links share a pathname and differ only in `?tab=`. The
                           router's own `aria-current` ignores a `tab: undefined`
                           ("don't care"), so Home lit up on every tab; with
                           `explicitUndefined` absence has to match absence, and the
                           router marks exactly one — no hand-rolled comparison, and no
                           location subscription per tree node. */
            <Link
              key={key}
              to="/teams/$groupId"
              params={{ groupId: nodeGroup.id }}
              search={{ tab: key === 'home' ? undefined : key }}
              activeOptions={{ explicitUndefined: true }}
              className={styles.item}
              style={{ '--depth': node.depth + 1 } as CSSProperties}
              onClick={(event) => event.stopPropagation()}
            >
              <span className={styles.icon}>{glyph}</span>
              <span className={styles.label}>{label}</span>
            </Link>
          ))}
        </div>
      )}

      {open && items.length > 0 && (
        <div className={styles.children} style={style}>
          {items.map((child) => (
            <Node
              key={child.id}
              node={child}
              activeId={activeId}
              onSelect={onSelect}
              structure={structure}
            />
          ))}
        </div>
      )}

      {/* Outside the collapsible on purpose (rule 2 above). Same class so the
                 guide-line elbow keeps drawing. */}
      {subGroups.length > 0 && (
        <div className={styles.children} style={style}>
          {subGroups.map((child) => (
            <Node
              key={child.id}
              node={child}
              activeId={activeId}
              onSelect={onSelect}
              structure={structure}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SectionHeader({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  const style = { '--depth': 0 } as CSSProperties

  return (
    <div>
      <div className={styles.row} style={style} onClick={() => setOpen((current) => !current)}>
        <div className={`${styles.item} ${styles.branch} ${styles.sectionLabel}`}>
          <span className={styles.label}>{title}</span>
        </div>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          aria-label={`${open ? 'Recolher' : 'Abrir'} ${title}`}
          onClick={(event) => {
            event.stopPropagation()
            setOpen((current) => !current)
          }}
        >
          <svg
            className={styles.chevron}
            width="12"
            height="12"
            viewBox="0 0 12 12"
            aria-hidden="true"
          >
            <path
              d="M4.5 2.5 8 6l-3.5 3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      {open && (
        <div className={`${styles.children} ${styles.sectionChildren}`} style={style}>
          {children}
        </div>
      )}
    </div>
  )
}

export function QueueSidebar({
  sections,
  activeId,
  onSelect,
  structure,
  viewerInitials,
  viewerName,
  viewerEmail,
  onLogout,
  onOpenSearch,
  collapsed = false,
}: QueueSidebarProps) {
  const [accountOpen, setAccountOpen] = useState(false)
  const accountTrigger = useRef<HTMLButtonElement>(null)
  return (
    <nav className={styles.sidebar} aria-label={constants.nav} hidden={collapsed}>
      <div className={styles.brand}>
        <PipoOsWordmark className={styles.wordmark} />
      </div>

      <div className={styles.search}>
        {/* Desabilitado até PD-110. Fica na tela porque é ele que ensina que a
            busca existe — sem o campo, ninguém descobre o atalho. */}
        {/* A button that looks like a field: it opens the palette instead of taking
                     text — a focused input that discards its text on open loses the
                     first keystroke. */}
        <button type="button" className={styles.searchTrigger} onClick={onOpenSearch}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.2" />
            <path
              d="m10.2 10.2 3 3"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
          <span className={styles.searchLabel}>{constants.search}</span>
          {/* Two keys, not one string: how a shortcut reads, and what the prototype draws. */}
          {constants.searchKeys.map((key) => (
            <kbd key={key} className={styles.key}>
              {key}
            </kbd>
          ))}
        </button>
      </div>

      <div className={styles.tree}>
        {sections.map((section) => (
          <div key={section.title}>
            <SectionHeader title={section.title}>
              {section.nodes.length === 0 ? (
                /* A labeled section draws even when empty (Favorites): without it,
                                   nothing would say starring exists. */
                <p className={styles.sectionEmpty}>{constants.emptyFavorites}</p>
              ) : (
                section.nodes.map((node) => (
                  <Node
                    key={node.id}
                    node={node}
                    activeId={activeId}
                    onSelect={onSelect}
                    structure={structure}
                  />
                ))
              )}
            </SectionHeader>
          </div>
        ))}
      </div>

      {/* The footer is the identity — the shell has no top bar. At rest it is the
                 avatar; e-mail and logout live in the panel. */}
      <div className={styles.footer}>
        <div className={styles.accountAnchor}>
          <button
            type="button"
            ref={accountTrigger}
            className={styles.viewer}
            aria-label={constants.account(viewerName)}
            aria-expanded={accountOpen}
            onClick={() => setAccountOpen((current) => !current)}
          >
            {/* Avatar only, like the prototype. The button's `aria-label` already says
                             whose account it is. */}
            <span className={styles.avatar} aria-hidden="true">
              {viewerInitials}
            </span>
          </button>
          <Popover
            open={accountOpen}
            onClose={() => setAccountOpen(false)}
            anchor={accountTrigger}
            label={constants.account(viewerName)}
            align="left"
          >
            <div className={styles.account}>
              <Text variant="bodySmall">{viewerEmail}</Text>
              <Button variant="secondary" onClick={onLogout}>
                {constants.logout}
              </Button>
            </div>
          </Popover>
        </div>
      </div>
    </nav>
  )
}
