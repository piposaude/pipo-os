import { render, screen } from '@testing-library/react'
import { DESK_ICON_NAMES, DeskIcon } from '@/components/pipodesk/icons'

describe('DeskIcon', () => {
  it('should carry the glyphs the design system does not have yet', () => {
    expect(DESK_ICON_NAMES).toContain('inbox')
    expect(DESK_ICON_NAMES).toContain('ticket')
    expect(DESK_ICON_NAMES).toContain('bolt')
    expect(DESK_ICON_NAMES).toContain('agent')
  })

  it('should be decorative by default, so a labelled control is not read twice', () => {
    const { container } = render(<DeskIcon name="inbox" />)
    const svg = container.querySelector('svg')

    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('should become an accessible image when it carries meaning of its own', () => {
    render(<DeskIcon name="bolt" title="Automação" />)

    expect(screen.getByRole('img', { name: 'Automação' })).toBeInTheDocument()
  })

  it('should paint with the current text color, so it inherits the row state', () => {
    const { container } = render(<DeskIcon name="ticket" />)

    expect(container.querySelector('[stroke="currentColor"]')).toBeInTheDocument()
  })

  /** Each glyph was drawn in its own box (16 units in the Pipo set). Drawing
   *  in a different viewBox shrinks it toward the top-left — exactly what
   *  happened to `new` in the sidebar. */
  it('should draw each glyph in the box it was designed in', () => {
    const { container } = render(<DeskIcon name="new" />)
    const svg = container.querySelector('svg')

    expect(svg).toHaveAttribute('viewBox', '0 0 16 16')
    expect(svg).toHaveAttribute('width', '16')
  })

  it('should keep every glyph in a square box, so none renders smaller than its siblings', () => {
    for (const name of DESK_ICON_NAMES) {
      const { container, unmount } = render(<DeskIcon name={name} />)
      const viewBox = container.querySelector('svg')?.getAttribute('viewBox')
      const [minX, minY, width, height] = (viewBox ?? '').split(' ').map(Number)

      expect(`${name}: ${minX} ${minY}`).toBe(`${name}: 0 0`)
      expect(`${name}: ${width}`).toBe(`${name}: ${height}`)
      unmount()
    }
  })

  it('should render every declared glyph without throwing', () => {
    for (const name of DESK_ICON_NAMES) {
      const { container, unmount } = render(<DeskIcon name={name} />)
      expect(container.querySelector('svg')).toBeInTheDocument()
      unmount()
    }
  })
})
