import { useState } from 'react'
import { Icon, PopoverMenu, PopoverMenuDivider, PopoverMenuItem } from '@piposaude/design-system'
import { DeskIcon } from '@/components/pipodesk/icons'
import constants from '@/constants/pipodesk/sidebar'
import styles from './QueueSidebar.module.css'

const copy = constants.rowMenu

export interface RowMenuProps {
  label: string
  onRename?: () => void
  onNewView?: () => void
  onDelete?: () => void
}

export function RowMenu({ label, onRename, onNewView, onDelete }: RowMenuProps) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    // The row selects on click: nothing inside the menu may reach it.
    <span
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <PopoverMenu
        isOpen={open}
        onClose={close}
        placement="bottom-end"
        className={styles.menuAnchor}
        trigger={
          <button
            type="button"
            data-row-menu
            className={styles.menuTrigger}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={copy.trigger(label)}
            onClick={() => setOpen((current) => !current)}
          >
            <DeskIcon name="more" size={14} />
          </button>
        }
      >
        {onRename && (
          <PopoverMenuItem
            icon={<Icon name="fill/pencil" size="sm" />}
            onClick={() => {
              close()
              onRename()
            }}
          >
            {copy.rename}
          </PopoverMenuItem>
        )}
        {onNewView && (
          <PopoverMenuItem
            icon={<Icon name="fill/plus" size="sm" />}
            onClick={() => {
              close()
              onNewView()
            }}
          >
            {copy.newView}
          </PopoverMenuItem>
        )}
        {onDelete && (
          <>
            <PopoverMenuDivider />
            <PopoverMenuItem
              destructive
              icon={<Icon name="fill/trash" size="sm" />}
              onClick={() => {
                close()
                onDelete()
              }}
            >
              {copy.deleteView}
            </PopoverMenuItem>
          </>
        )}
      </PopoverMenu>
    </span>
  )
}
