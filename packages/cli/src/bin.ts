#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';
import fs from 'node:fs';

function getVersion(): string {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    if (fs.existsSync(pkgPath)) {
      return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version ?? '0.1.0';
    }
  } catch {}
  return '0.1.0';
}

const program = new Command();

program
  .name('durion')
  .description('Durion CLI — durable AI workflows and agents on Temporal')
  .version(getVersion());

program
  .command('dev')
  .description('Start the full development stack (Temporal + worker + gateway + Studio)')
  .option('--no-temporal', 'Skip auto-starting Temporal dev server')
  .option('--no-gateway', 'Skip the built-in gateway')
  .option('--no-studio', 'Skip Studio UI')
  .option('--worker-only', 'Start only the worker process')
  .action(async (opts) => {
    const { runDev } = await import('./commands/dev');
    await runDev({
      noTemporal: !opts.temporal,
      noGateway: !opts.gateway,
      noStudio: !opts.studio,
      workerOnly: opts.workerOnly,
    });
  });

program
  .command('doctor')
  .description('Check prerequisites and project configuration')
  .action(async () => {
    const { runDoctor } = await import('./commands/doctor');
    await runDoctor();
  });

program
  .command('studio')
  .description('Start Studio UI standalone')
  .option('-p, --port <port>', 'Studio port', parseInt)
  .option('--gateway-url <url>', 'Gateway URL to proxy /v0 requests to')
  .action(async (opts) => {
    const { runStudio } = await import('./commands/studio');
    await runStudio({
      port: opts.port,
      gatewayUrl: opts.gatewayUrl,
    });
  });

program.parse();
