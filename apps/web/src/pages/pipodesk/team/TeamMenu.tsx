import { useState } from 'react'
import { Icon, PopoverMenu, PopoverMenuItem } from '@piposaude/design-system'
import { DeskIcon } from '@/components/pipodesk/icons'
import sidebarConstants from '@/constants/pipodesk/sidebar'
import styles from './style.module.css'

const copy = sidebarConstants.rowMenu

export interface TeamMenuProps {
  name: string
  onRename: () => void
}

/**
 * The team's …, beside the name and always visible: the tree's row menu only
 * shows on hover, and whoever never hovers never finds it. Same items and copy
 * as the tree's, so the two read as one gesture.
 */
export function TeamMenu({ name, onRename }: TeamMenuProps) {
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
          aria-label={copy.trigger(name)}
          onClick={() => setOpen((current) => !current)}
        >
          <DeskIcon name="more" size={16} />
        </button>
      }
    >
      <PopoverMenuItem
        icon={<Icon name="fill/pencil" size="sm" />}
        onClick={() => {
          close()
          onRename()
        }}
      >
        {copy.rename}
      </PopoverMenuItem>
    </PopoverMenu>
  )
}
