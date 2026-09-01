import { createElement, type SVGProps } from 'react'
import { GLYPHS, type GlyphNode } from './glyphs'

export interface DeskIconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  name: string
  /** Pass when the icon IS the information. Without it the glyph is decorative
   *  and not read twice next to its label. */
  title?: string
  size?: number
}

const render = (node: GlyphNode, key: number): React.ReactNode =>
  createElement(
    node.tag,
    { ...node.attrs, key },
    node.children?.map((child, index) => render(child, index)),
  )

/** A Pipodesk glyph. Paints with `currentColor`, inheriting the row state. */
export function DeskIcon({ name, title, size = 16, ...rest }: DeskIconProps) {
  const glyph = GLYPHS[name]
  if (!glyph) return null

  return (
    <svg
      width={size}
      height={size}
      // Use the glyph's own box: the set mixes 16 and 24 units, and a 16-unit
      // stroke in a 24 box shrinks to two thirds, pinned to the top-left.
      viewBox={glyph.viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
      {...rest}
    >
      {glyph.nodes.map((node, index) => render(node, index))}
    </svg>
  )
}
