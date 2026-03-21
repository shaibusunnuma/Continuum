/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AI_RUNTIME_GATEWAY_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
