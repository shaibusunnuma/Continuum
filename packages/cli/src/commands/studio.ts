import path from 'node:path';
import fs from 'node:fs';
import { loadConfig, resolveStudioPort, resolveGatewayPort } from '../config';
import { logInfo, logStatus, logBlank, logError } from '../logger';
import { spawnLabeled, shutdownAll } from '../process-manager';

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

  const studioBin = resolveStudioPackageBin(projectRoot);
  if (!studioBin) {
    logError('Studio package not found.');
    logInfo('Install @durion/studio or run from within the Durion monorepo.');
    process.exit(1);
  }

  process.stdout.write('\n');
  logStatus('studio', 'start', 'Starting Studio...');

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
