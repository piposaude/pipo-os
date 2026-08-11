/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly WEB_APP_SENTRY_DSN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
