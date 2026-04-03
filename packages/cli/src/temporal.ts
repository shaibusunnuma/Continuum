import { execSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import { spawnLabeled, type ManagedProcess } from './process-manager';
import { logStatus, logInfo, logWarn, logError } from './logger';

export interface TemporalInfo {
  found: boolean;
  path?: string;
  version?: string;
}

/**
 * Detect the `temporal` CLI in $PATH and return version info.
 */
export function detectTemporalCli(): TemporalInfo {
  try {
    const result = execSync('temporal --version', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const versionMatch = result.match(/(\d+\.\d+\.\d+)/);

    let binPath: string | undefined;
    try {
      binPath = execSync('which temporal', {
        encoding: 'utf-8',
        timeout: 3000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch {
      // which may not be available on all systems
    }

    return {
      found: true,
      path: binPath,
      version: versionMatch?.[1],
    };
  } catch {
    return { found: false };
  }
}

/**
 * Check if a TCP port is reachable (Temporal gRPC).
 */
export function isPortReachable(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);

    socket.once('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });

    socket.once('error', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

export function parseAddress(address: string): { host: string; port: number } {
  const parts = address.split(':');
  const port = parseInt(parts[parts.length - 1], 10);
  const host = parts.slice(0, -1).join(':') || 'localhost';
  return { host, port: Number.isNaN(port) ? 7233 : port };
}

/**
 * Print installation instructions for the user's OS.
 */
export function printTemporalInstallInstructions(): void {
  logError('Temporal CLI not found in $PATH');
  logInfo('Install it for your platform:');
  logInfo('  macOS:   brew install temporal');
  logInfo('  Linux:   curl -sSf https://temporal.download/cli.sh | sh');
  logInfo('  Windows: winget install temporalio.cli');
  logInfo('');
  logInfo('Then run this command again.');
}

/**
 * Start `temporal server start-dev` as a managed child process.
 * Returns when the server port becomes reachable.
 */
export async function startTemporalDevServer(opts: {
  projectRoot: string;
  address: string;
  namespace: string;
  uiPort: number;
}): Promise<ManagedProcess> {
  const { projectRoot, address, namespace, uiPort } = opts;
  const { host, port } = parseAddress(address);

  const durionDir = path.join(projectRoot, '.durion');
  if (!fs.existsSync(durionDir)) {
    fs.mkdirSync(durionDir, { recursive: true });
  }

  const gitignorePath = path.join(durionDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, '*\n');
  }

  const dbFilename = path.join(durionDir, 'temporal.db');

  logStatus('temporal', 'start', 'Starting Temporal dev server...');

  const proc = spawnLabeled({
    label: 'temporal',
    command: 'temporal',
    args: [
      'server', 'start-dev',
      '--namespace', namespace,
      '--db-filename', dbFilename,
      '--ui-port', String(uiPort),
      '--port', String(port),
      '--log-format', 'pretty',
      '--log-level', 'warn',
    ],
    cwd: projectRoot,
  });

  await waitForPort(host, port, 30_000);
  logStatus('temporal', 'ready', `${address} (Web UI: http://localhost:${uiPort})`);

  return proc;
}

async function waitForPort(host: string, port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortReachable(host, port, 500)) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Temporal server did not become reachable at ${host}:${port} within ${timeoutMs}ms`);
}
