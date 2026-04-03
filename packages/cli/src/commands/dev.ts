import path from 'node:path';
import fs from 'node:fs';
import { loadConfig, resolveGatewayPort, resolveStudioPort, resolveTemporalConfig } from '../config';
import { logHeader, logStatus, logBlank, logInfo, logError } from '../logger';
import { spawnLabeled, shutdownAll } from '../process-manager';
import {
  detectTemporalCli,
  isPortReachable,
  parseAddress,
  printTemporalInstallInstructions,
  startTemporalDevServer,
} from '../temporal';
import { startGateway, stopGateway } from '../gateway/server';
import type { FastifyInstance } from 'fastify';

export interface DevOptions {
  noTemporal?: boolean;
  noGateway?: boolean;
  noStudio?: boolean;
  workerOnly?: boolean;
}

export async function runDev(opts: DevOptions): Promise<void> {
  const projectRoot = process.cwd();
  const config = await loadConfig(projectRoot);
  const version = getCliVersion();

  logHeader(version);

  // Load .env
  try {
    const dotenv = await import('dotenv');
    dotenv.config({ path: path.join(projectRoot, '.env') });
  } catch {
    // dotenv optional
  }

  const temporalCfg = resolveTemporalConfig(config);
  const skipTemporal = opts.noTemporal || opts.workerOnly;
  const skipGateway = opts.noGateway || opts.workerOnly || config.gateway === false;
  const skipStudio = opts.noStudio || opts.workerOnly || config.studio === false;

  let gatewayInstance: FastifyInstance | undefined;

  // 1. Temporal
  if (!skipTemporal && temporalCfg.devServer) {
    const cli = detectTemporalCli();
    if (!cli.found) {
      printTemporalInstallInstructions();
      process.exit(1);
    }

    const { host, port } = parseAddress(temporalCfg.address);
    const alreadyRunning = await isPortReachable(host, port);

    if (alreadyRunning) {
      logStatus('temporal', 'ready', `Already running at ${temporalCfg.address}`);
    } else {
      await startTemporalDevServer({
        projectRoot,
        address: temporalCfg.address,
        namespace: temporalCfg.namespace,
        uiPort: temporalCfg.uiPort,
      });
    }
  } else if (!skipTemporal) {
    const { host, port } = parseAddress(temporalCfg.address);
    const reachable = await isPortReachable(host, port);
    if (reachable) {
      logStatus('temporal', 'ready', `Connected to ${temporalCfg.address}`);
    } else {
      logStatus('temporal', 'error', `Not reachable at ${temporalCfg.address}`);
      logInfo('Start Temporal manually or set temporal.devServer: true in durion.config.ts');
    }
  }

  // 2. Worker
  const workerPath = path.resolve(projectRoot, config.workerPath);
  if (!fs.existsSync(workerPath)) {
    logError(`Worker file not found: ${config.workerPath}`);
    logInfo('Create it or update workerPath in durion.config.ts');
    await shutdownAll();
    process.exit(1);
  }

  logStatus('worker', 'start', 'Starting worker...');

  const tsxBin = resolveBin(projectRoot, 'tsx');
  const workerEnv: Record<string, string> = {
    TEMPORAL_ADDRESS: temporalCfg.address,
    TEMPORAL_NAMESPACE: temporalCfg.namespace,
  };

  // Point OTEL traces to the built-in gateway for Studio span ingestion
  const gatewayPort = resolveGatewayPort(config);
  if (!skipGateway && gatewayPort) {
    workerEnv.DURION_STUDIO_LOCAL = 'true';
    workerEnv.OTEL_EXPORTER_OTLP_ENDPOINT = `http://127.0.0.1:${gatewayPort}/v1/traces`;
  }

  spawnLabeled({
    label: 'worker',
    command: tsxBin,
    args: ['--watch', workerPath],
    cwd: projectRoot,
    env: workerEnv,
    onExit: (code) => {
      if (code !== null && code !== 0) {
        logStatus('worker', 'error', `Crashed (exit ${code}). Waiting for file changes to restart...`);
      }
    },
  });

  // Give worker a moment to initialize before reporting ready
  await new Promise((r) => setTimeout(r, 1500));
  logStatus('worker', 'ready', `Watching ${config.workerPath}`);

  // 3. Gateway
  if (!skipGateway && gatewayPort) {
    logStatus('gateway', 'start', 'Starting API server...');
    try {
      gatewayInstance = await startGateway({
        port: gatewayPort,
        host: config.gateway !== false ? (config.gateway?.host ?? '0.0.0.0') : '0.0.0.0',
        temporalAddress: temporalCfg.address,
        temporalNamespace: temporalCfg.namespace,
        gatewayToken: process.env.DURION_GATEWAY_TOKEN || undefined,
      });
      logStatus('gateway', 'ready', `http://localhost:${gatewayPort}`);
    } catch (err) {
      logStatus('gateway', 'error', `Failed to start: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 4. Studio
  if (!skipStudio) {
    const studioPort = resolveStudioPort(config) ?? 4173;
    logStatus('studio', 'start', 'Starting Studio...');

    const studioBin = resolveStudioPackageBin(projectRoot);
    if (studioBin) {
      const studioEnv: Record<string, string> = {};
      if (gatewayPort) {
        studioEnv.STUDIO_GATEWAY_URL = `http://127.0.0.1:${gatewayPort}`;
      }
      studioEnv.VITE_PORT = String(studioPort);

      spawnLabeled({
        label: 'studio',
        command: process.execPath,
        args: [studioBin, 'dev', '--port', String(studioPort)],
        cwd: projectRoot,
        env: studioEnv,
      });

      // Wait a moment for Vite startup
      await new Promise((r) => setTimeout(r, 2000));
      logStatus('studio', 'ready', `http://localhost:${studioPort}`);
    } else {
      logStatus('studio', 'error', 'Studio package not found. Install @durion/studio to enable.');
    }
  }

  logBlank();
  logInfo('Ready. Watching for changes... (Ctrl+C to stop)');
  logBlank();

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    logBlank();
    logInfo('Shutting down...');
    if (gatewayInstance) {
      await stopGateway(gatewayInstance).catch(() => {});
    }
    await shutdownAll();
    process.exit(0);
  };

  process.on('SIGINT', () => { shutdown(); });
  process.on('SIGTERM', () => { shutdown(); });
}

function getCliVersion(): string {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    if (fs.existsSync(pkgPath)) {
      return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version ?? '0.1.0';
    }
  } catch {}
  return '0.1.0';
}

function resolveBin(projectRoot: string, name: string): string {
  const localBin = path.join(projectRoot, 'node_modules', '.bin', name);
  if (fs.existsSync(localBin)) return localBin;
  // Fallback: try resolving from monorepo root node_modules
  const monorepoBin = path.join(projectRoot, '..', 'node_modules', '.bin', name);
  if (fs.existsSync(monorepoBin)) return monorepoBin;
  return name; // fall through to $PATH
}

function resolveStudioPackageBin(projectRoot: string): string | null {
  // Try local node_modules first
  const localBin = path.join(projectRoot, 'node_modules', '@durion', 'studio', 'bin', 'durion-studio.mjs');
  if (fs.existsSync(localBin)) return localBin;
  // Try monorepo sibling package
  const sibling = path.join(projectRoot, '..', 'studio', 'bin', 'durion-studio.mjs');
  if (fs.existsSync(sibling)) return sibling;
  // Try from packages/cli context within the monorepo
  const monorepoStudio = path.join(__dirname, '..', '..', '..', 'studio', 'bin', 'durion-studio.mjs');
  if (fs.existsSync(monorepoStudio)) return monorepoStudio;
  return null;
}
