import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  // Design system runtime assets (fonts, logos) copied by scripts/copy-ds-assets.mjs.
  staticDirs: ['../public'],
}

export default config
