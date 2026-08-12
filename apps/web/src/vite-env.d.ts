/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly WEB_APP_SENTRY_DSN?: string
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
