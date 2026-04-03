import { spawn, type ChildProcess } from 'node:child_process';
import { logPrefixed, logStatus } from './logger';

export interface ManagedProcess {
  label: string;
  child: ChildProcess;
  command: string;
}

const managed: ManagedProcess[] = [];
let isShuttingDown = false;

export function spawnLabeled(opts: {
  label: string;
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string | undefined>;
  onExit?: (code: number | null) => void;
}): ManagedProcess {
  const { label, command, args, cwd, env, onExit } = opts;
  const fullEnv = { ...process.env, ...env };

  const child = spawn(command, args, {
    cwd,
    env: fullEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });

  const proc: ManagedProcess = { label, child, command: `${command} ${args.join(' ')}` };
  managed.push(proc);

  child.stdout?.on('data', (data: Buffer) => {
    logPrefixed(label, data.toString());
  });

  child.stderr?.on('data', (data: Buffer) => {
    logPrefixed(label, data.toString());
  });

  child.on('exit', (code) => {
    const idx = managed.indexOf(proc);
    if (idx !== -1) managed.splice(idx, 1);

    if (!isShuttingDown) {
      if (code !== 0 && code !== null) {
        logStatus(label, 'error', `Exited with code ${code}`);
      }
      onExit?.(code);
    }
  });

  child.on('error', (err) => {
    logStatus(label, 'error', err.message);
  });

  return proc;
}

/**
 * Gracefully shut down all managed processes in reverse order.
 * Sends SIGTERM, then SIGKILL after a timeout.
 */
export async function shutdownAll(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  const toStop = [...managed].reverse();

  for (const proc of toStop) {
    logStatus(proc.label, 'stop', 'Stopping...');
    await killProcess(proc.child);
  }

  managed.length = 0;
}

function killProcess(child: ChildProcess, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.killed) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, timeoutMs);

    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });

    child.kill('SIGTERM');
  });
}

export function getManagedProcesses(): ReadonlyArray<ManagedProcess> {
  return managed;
}
