import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { initSentryReact, SentryErrorBoundary } from '@pipo-os/observability/sentry-react'
import App from './App'

initSentryReact({
  dsn: import.meta.env.WEB_APP_SENTRY_DSN,
  environment: import.meta.env.MODE,
})

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SentryErrorBoundary fallback={<p>Algo deu errado. Recarregue a página.</p>}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </SentryErrorBoundary>
  </React.StrictMode>,
)
