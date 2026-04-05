#!/usr/bin/env node
/**
 * Copy packages/studio/dist → packages/cli/studio-dist for bundling Studio in the gateway.
 * Run after `vite build` in @durion/studio (e.g. via turbo or `npm run build` at repo root).
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliRoot = join(__dirname, '..');
const studioDist = join(cliRoot, '..', 'studio', 'dist');
const target = join(cliRoot, 'studio-dist');
const marker = join(studioDist, 'index.html');

if (!existsSync(marker)) {
  console.error(
    '[@durion/cli] copy-studio: missing packages/studio/dist/index.html — run `npm run build -w @durion/studio` (or `turbo run build`) first.',
  );
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(studioDist, target, { recursive: true });
console.log('[@durion/cli] copy-studio: copied Studio dist → studio-dist');
