import react from '@pipo-os/eslint-config/react'
import storybook from 'eslint-plugin-storybook'

export default [
  {
    ignores: ['src/routeTree.gen.ts', 'public', 'storybook-static'],
  },
  ...react,
  ...storybook.configs['flat/recommended'],
]
