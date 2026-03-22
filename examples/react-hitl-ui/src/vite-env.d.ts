/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DURION_GATEWAY_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
