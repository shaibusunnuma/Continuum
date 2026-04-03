#!/usr/bin/env node
/**
 * CLI entry: runs the Vite dev server for Durion Studio (same as `npm run dev` in this package).
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// Vite 8+ does not export `vite/bin/vite.js` in `exports`; `vite/package.json` is exported.
const viteRoot = path.dirname(require.resolve('vite/package.json'));
const viteBin = path.join(viteRoot, 'bin', 'vite.js');

const mode = process.argv[2] === 'preview' ? 'preview' : 'dev';

const child = spawn(process.execPath, [viteBin, mode, '--config', path.join(root, 'vite.config.ts')], {
  cwd: root,
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 0));
