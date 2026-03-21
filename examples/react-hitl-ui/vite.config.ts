import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiTarget = process.env.VITE_API_PROXY ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    /** CJS `dist` build breaks Vite named imports; bundle from source. */
    alias: {
      '@ai-runtime/react': path.resolve(__dirname, '../../packages/react/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/v0': { target: apiTarget, changeOrigin: true },
      '/workflows': { target: apiTarget, changeOrigin: true },
      '/runs': { target: apiTarget, changeOrigin: true },
    },
  },
});
