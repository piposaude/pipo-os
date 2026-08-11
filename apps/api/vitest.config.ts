import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: [{ find: /^(\.{1,2}\/.*)\.js$/, replacement: '$1' }],
  },
  test: {
    server: {
      deps: {
        inline: ['@fastify/autoload'],
      },
    },
  },
})
