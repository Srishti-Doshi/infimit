/// <reference types="vite/client" />
/// <reference types="@testing-library/jest-dom" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK: string;
  readonly VITE_API_BASE_URL: string;
  /** Origin serving media objects (covers, e-paper PDFs). MinIO in dev. */
  readonly VITE_MEDIA_ORIGIN: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
