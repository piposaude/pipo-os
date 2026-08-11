import React from 'react'
import ReactDOM from 'react-dom/client'
import { initSentryReact, SentryErrorBoundary } from '@pipo-os/observability/sentry-react'
import App from './App'

initSentryReact({
  dsn: import.meta.env.WEB_APP_SENTRY_DSN,
  environment: import.meta.env.MODE,
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SentryErrorBoundary fallback={<p>Algo deu errado. Recarregue a página.</p>}>
      <App />
    </SentryErrorBoundary>
  </React.StrictMode>,
)
