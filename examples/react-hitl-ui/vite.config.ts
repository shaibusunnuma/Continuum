import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** HITL demo API — `examples/hitl-gateway` (default port 3001). Studio uses `studio-server` on 3000. */
const apiTarget = process.env.VITE_API_PROXY ?? 'http://127.0.0.1:3001';

export default defineConfig({
  /** Run `vite` from `examples/` with `--config react-hitl-ui/vite.config.ts`. */
  root: __dirname,
  plugins: [react()],
  resolve: {
    /** CJS `dist` build breaks Vite named imports; bundle from source. */
    alias: {
      '@durion/react': path.resolve(__dirname, '../../packages/react/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/v0': { target: apiTarget, changeOrigin: true },
    },
  },
});
