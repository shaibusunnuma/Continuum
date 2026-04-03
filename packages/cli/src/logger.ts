import pc from 'picocolors';

type LabelColor = 'cyan' | 'green' | 'yellow' | 'magenta' | 'blue' | 'red';

const COLOR_FNS: Record<LabelColor, (s: string) => string> = {
  cyan: pc.cyan,
  green: pc.green,
  yellow: pc.yellow,
  magenta: pc.magenta,
  blue: pc.blue,
  red: pc.red,
};

const LABEL_COLORS: Record<string, LabelColor> = {
  temporal: 'cyan',
  worker: 'green',
  gateway: 'yellow',
  studio: 'magenta',
  durion: 'blue',
};

function padLabel(label: string): string {
  return label.padEnd(10);
}

function formatLabel(label: string): string {
  const color = LABEL_COLORS[label] ?? 'blue';
  return COLOR_FNS[color](padLabel(label));
}

export function logPrefixed(label: string, message: string): void {
  const lines = message.split('\n');
  for (const line of lines) {
    if (line.trim()) {
      process.stdout.write(`  ${formatLabel(label)} ${line}\n`);
    }
  }
}

export function logStatus(label: string, status: 'start' | 'ready' | 'error' | 'stop', message: string): void {
  const icon = status === 'start' ? pc.yellow('▸')
    : status === 'ready' ? pc.green('✓')
    : status === 'error' ? pc.red('✗')
    : pc.dim('■');
  process.stdout.write(`  ${icon} ${formatLabel(label)} ${message}\n`);
}

export function logHeader(version: string): void {
  process.stdout.write(`\n  ${pc.bold('durion dev')} ${pc.dim(`v${version}`)}\n\n`);
}

export function logBlank(): void {
  process.stdout.write('\n');
}

export function logInfo(message: string): void {
  process.stdout.write(`  ${pc.blue('ℹ')} ${message}\n`);
}

export function logError(message: string): void {
  process.stdout.write(`  ${pc.red('✗')} ${message}\n`);
}

export function logSuccess(message: string): void {
  process.stdout.write(`  ${pc.green('✓')} ${message}\n`);
}

export function logWarn(message: string): void {
  process.stdout.write(`  ${pc.yellow('!')} ${message}\n`);
}
