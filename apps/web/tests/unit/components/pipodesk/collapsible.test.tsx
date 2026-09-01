import { fireEvent, render, screen } from '@testing-library/react'
import { Collapsible } from '@/components/pipodesk/primitives'

describe('Collapsible', () => {
  it('should expose the open state to assistive technology', () => {
    render(
      <Collapsible open label="POD 5" onToggle={vi.fn()}>
        <span>Chamados</span>
      </Collapsible>,
    )

    expect(screen.getByRole('button', { name: /POD 5/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Chamados')).toBeInTheDocument()
  })

  it('should hide the children when collapsed', () => {
    render(
      <Collapsible open={false} label="POD 5" onToggle={vi.fn()}>
        <span>Chamados</span>
      </Collapsible>,
    )

    expect(screen.getByRole('button', { name: /POD 5/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Chamados')).not.toBeInTheDocument()
  })

  it('should ask the owner to toggle, since the sidebar keeps the open state', () => {
    const onToggle = vi.fn()
    render(
      <Collapsible open={false} label="POD 5" onToggle={onToggle}>
        <span>Chamados</span>
      </Collapsible>,
    )

    fireEvent.click(screen.getByRole('button', { name: /POD 5/ }))

    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
