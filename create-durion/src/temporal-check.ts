import { execSync } from 'node:child_process';

export interface TemporalInfo {
  found: boolean;
  path?: string;
  version?: string;
}

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
    } catch {}

    return {
      found: true,
      path: binPath,
      version: versionMatch?.[1],
    };
  } catch {
    return { found: false };
  }
}

export function getTemporalInstallHint(): string {
  const platform = process.platform;
  if (platform === 'darwin') return 'brew install temporal';
  if (platform === 'win32') return 'winget install temporalio.cli';
  return 'curl -sSf https://temporal.download/cli.sh | sh';
}
