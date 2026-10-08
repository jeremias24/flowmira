/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** flowmira-erd API (development only; in Docker it's served under /api/erd). */
  readonly VITE_ERD_API_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
