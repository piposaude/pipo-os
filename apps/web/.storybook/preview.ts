import type { Preview } from '@storybook/react'
import '@piposaude/design-system/tokens.css'
import '@piposaude/design-system/index.css'

// Same base class the app sets on <body> — brings DS typography and surface.
document.body.classList.add('pipo-base')

const preview: Preview = {}

export default preview
