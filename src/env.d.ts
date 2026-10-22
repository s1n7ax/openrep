/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Remote catalog URL; defaults to the repository's published catalog. Set by e2e tests. */
  readonly VITE_CATALOG_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
