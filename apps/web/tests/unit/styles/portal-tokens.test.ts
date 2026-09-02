import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** A token scoped to `.desk-root` resolves to nothing in a portal and voids
 *  its declaration. jsdom does not resolve `var()` from stylesheets, so the
 *  guard reads the CSS itself. */
const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')

const PORTALED = ['src/components/pipodesk/queue/SearchPalette.module.css']

const rootDeclarations = (): string => {
  const tokens = read('src/styles/pipodesk-tokens.css')
  const at = tokens.indexOf(':root {')
  expect(at).toBeGreaterThan(-1)
  return tokens.slice(at, tokens.indexOf('}', at))
}

describe('tokens de componentes em portal', () => {
  it('should declare every desk token a portaled stylesheet uses at the document root', () => {
    const declared = rootDeclarations()

    for (const path of PORTALED) {
      const used = [...read(path).matchAll(/var\((--desk-[\w-]+)/g)].map((match) => match[1])
      expect(used.length).toBeGreaterThan(0)
      for (const token of new Set(used)) {
        expect(declared, `${token} usado por ${path}`).toContain(`${token}:`)
      }
    }
  })
})
