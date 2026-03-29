import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/v0': {
        target: process.env.STUDIO_GATEWAY_URL ?? 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
});
