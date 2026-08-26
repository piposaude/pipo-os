import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: [{ find: /^(\.{1,2}\/.*)\.js$/, replacement: '$1' }],
  },
  test: {
    // Disabled because test files share a single DB instance and each suite
    // truncates tables in afterEach — parallel execution causes race conditions.
    fileParallelism: false,
    server: {
      deps: {
        inline: ['@fastify/autoload'],
      },
    },
  },
})
