// Copies the design system's runtime assets (fonts, logos, illustrations)
// into public/ so they are served at the web root, as tokens.css expects
// (e.g. url('/fonts/...')). public/ is fully generated and git-ignored;
// wired as pre-step of dev, build and storybook.
import { cpSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = fileURLToPath(
  new URL('../node_modules/@piposaude/design-system/public', import.meta.url),
)
const destination = fileURLToPath(new URL('../public', import.meta.url))

rmSync(destination, { recursive: true, force: true })
cpSync(source, destination, { recursive: true, dereference: true })
