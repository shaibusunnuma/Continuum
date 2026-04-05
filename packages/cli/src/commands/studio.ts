import path from 'node:path';
import fs from 'node:fs';
import { loadConfig, resolveStudioPort, resolveGatewayPort } from '../config';
import { logInfo, logStatus, logBlank, logError } from '../logger';
import { spawnLabeled, shutdownAll } from '../process-manager';
import { resolveBundledStudioDir } from '../gateway/bundled-studio';

export interface StudioOptions {
  port?: number;
  gatewayUrl?: string;
}

export async function runStudio(opts: StudioOptions): Promise<void> {
  const projectRoot = process.cwd();
  const config = await loadConfig(projectRoot);

  const studioPort = opts.port ?? resolveStudioPort(config) ?? 4173;
  const gatewayPort = resolveGatewayPort(config);
  const gatewayUrl = opts.gatewayUrl ?? (gatewayPort ? `http://127.0.0.1:${gatewayPort}` : undefined);

  const bundledStudio = resolveBundledStudioDir();
  const studioBin = resolveStudioPackageBin(projectRoot);

  if (!studioBin && bundledStudio) {
    process.stdout.write('\n');
    logInfo('Durion Studio is bundled in @durion/cli and served by the dev gateway.');
    if (gatewayUrl) {
      logInfo(`Open ${gatewayUrl}/ (start the gateway with \`npx durion dev\` if it is not running).`);
    } else {
      logInfo('Run `npx durion dev` — Studio is at the gateway URL (default http://localhost:3000/).');
    }
    logBlank();
    process.exit(0);
  }

  if (!studioBin) {
    logError('No bundled Studio in this CLI build and no local @durion/studio (monorepo).');
    logInfo('Use a published @durion/cli built with studio-dist, or clone the Durion repo to work on Studio with Vite.');
    process.exit(1);
  }

  process.stdout.write('\n');
  logStatus('studio', 'start', 'Starting Studio (Vite)...');

  const env: Record<string, string> = {};
  if (gatewayUrl) {
    env.STUDIO_GATEWAY_URL = gatewayUrl;
  }

  spawnLabeled({
    label: 'studio',
    command: process.execPath,
    args: [studioBin, 'dev', '--port', String(studioPort)],
    cwd: projectRoot,
    env,
  });

  await new Promise((r) => setTimeout(r, 2000));
  logStatus('studio', 'ready', `http://localhost:${studioPort}`);
  if (gatewayUrl) {
    logInfo(`Proxying /v0 to ${gatewayUrl}`);
  }
  logBlank();

  const shutdown = async (): Promise<void> => {
    logBlank();
    logInfo('Shutting down...');
    await shutdownAll();
    process.exit(0);
  };

  process.on('SIGINT', () => { shutdown(); });
  process.on('SIGTERM', () => { shutdown(); });
}

function resolveStudioPackageBin(projectRoot: string): string | null {
  const candidates = [
    path.join(projectRoot, 'node_modules', '@durion', 'studio', 'bin', 'durion-studio.mjs'),
    path.join(projectRoot, '..', 'studio', 'bin', 'durion-studio.mjs'),
    path.join(__dirname, '..', '..', '..', 'studio', 'bin', 'durion-studio.mjs'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}
