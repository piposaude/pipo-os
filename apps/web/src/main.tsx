import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { initSentryReact, SentryErrorBoundary } from '@pipo-os/observability/sentry-react'
import '@piposaude/design-system/tokens.css'
import '@piposaude/design-system/index.css'
import './styles/global.css'
import { router } from './router'

initSentryReact({
  dsn: import.meta.env.WEB_APP_SENTRY_DSN,
  environment: import.meta.env.MODE,
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SentryErrorBoundary fallback={<p>Algo deu errado. Recarregue a página.</p>}>
      <RouterProvider router={router} />
    </SentryErrorBoundary>
  </React.StrictMode>,
)
