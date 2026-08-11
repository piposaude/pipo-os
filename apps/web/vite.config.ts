import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // WEB_APP_ além do VITE_ padrão: variáveis do observability (ex.: WEB_APP_SENTRY_DSN)
  // não usam o prefixo VITE_.
  envPrefix: ['VITE_', 'WEB_APP_'],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
