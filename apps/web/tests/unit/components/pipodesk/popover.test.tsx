import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { Popover } from '@/components/pipodesk/primitives'

function Harness({ onOpenChange }: { onOpenChange?: (open: boolean) => void } = {}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const change = (next: boolean) => {
    setOpen(next)
    onOpenChange?.(next)
  }

  return (
    <div>
      <button type="button" ref={trigger} onClick={() => change(!open)}>
        Filtros
      </button>
      <Popover open={open} onClose={() => change(false)} label="Filtros" anchor={trigger}>
        <button type="button">Status</button>
      </Popover>
      <button type="button">Fora</button>
    </div>
  )
}

describe('Popover', () => {
  it('should render nothing while closed, so the content is not in the accessibility tree', () => {
    render(<Harness />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Status' })).not.toBeInTheDocument()
  })

  it('should show the content when opened, labelled for screen readers', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-label', 'Filtros')
    expect(screen.getByRole('button', { name: 'Status' })).toBeInTheDocument()
  })

  it('should close on Escape, which is the gesture the design system Modal still lacks', () => {
    const onOpenChange = vi.fn()
    render(<Harness onOpenChange={onOpenChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('should close when the click lands outside of it', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Fora' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  /** Without the anchor, the outside `mousedown` closed the panel and the
   *  trigger's click reopened it — the button could not close what it opened. */
  it('should let the trigger close it, in one gesture', async () => {
    render(<Harness />)
    const user = userEvent.setup()
    const trigger = screen.getByRole('button', { name: 'Filtros' })

    await user.click(trigger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(trigger)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('should stay open when the click lands inside of it', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Status' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
