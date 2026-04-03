import path from 'node:path';
import fs from 'node:fs';
import { loadConfig, resolveTemporalConfig } from '../config';
import { logSuccess, logError, logWarn, logBlank, logInfo } from '../logger';
import { detectTemporalCli, isPortReachable, parseAddress, printTemporalInstallInstructions } from '../temporal';

export async function runDoctor(): Promise<void> {
  const projectRoot = process.cwd();
  let allGood = true;

  process.stdout.write('\n  durion doctor\n\n');

  // 1. Node.js version
  const nodeVersion = process.versions.node;
  const [major] = nodeVersion.split('.').map(Number);
  if (major >= 20) {
    logSuccess(`Node.js v${nodeVersion} (>= 20.0.0 required)`);
  } else {
    logError(`Node.js v${nodeVersion} — version 20+ required`);
    allGood = false;
  }

  // 2. Temporal CLI
  const temporal = detectTemporalCli();
  if (temporal.found) {
    const loc = temporal.path ? ` at ${temporal.path}` : '';
    logSuccess(`Temporal CLI${temporal.version ? ` v${temporal.version}` : ''} found${loc}`);
  } else {
    allGood = false;
    printTemporalInstallInstructions();
  }

  // 3. durion.config.ts
  const config = await loadConfig(projectRoot);
  const hasConfigFile = ['durion.config.ts', 'durion.config.js', 'durion.config.mjs'].some(
    (f) => fs.existsSync(path.join(projectRoot, f)),
  );
  if (hasConfigFile) {
    logSuccess('durion.config.ts found');
  } else {
    logWarn('No durion.config.ts found (using defaults)');
  }

  // 4. .env file
  const envPath = path.join(projectRoot, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const dotenv = await import('dotenv');
      const parsed = dotenv.parse(fs.readFileSync(envPath, 'utf-8'));
      const count = Object.keys(parsed).length;
      logSuccess(`.env loaded (${count} variable${count !== 1 ? 's' : ''})`);

      // Check key variables
      if (parsed.TEMPORAL_ADDRESS || process.env.TEMPORAL_ADDRESS) {
        logSuccess(`TEMPORAL_ADDRESS = ${parsed.TEMPORAL_ADDRESS ?? process.env.TEMPORAL_ADDRESS ?? 'localhost:7233'}`);
      } else {
        logWarn('TEMPORAL_ADDRESS not set (defaulting to localhost:7233)');
      }

      if (parsed.TASK_QUEUE || process.env.TASK_QUEUE) {
        logSuccess(`TASK_QUEUE = ${parsed.TASK_QUEUE ?? process.env.TASK_QUEUE}`);
      } else {
        logWarn('TASK_QUEUE not set (defaulting to "durion")');
      }

      // Check for any LLM key
      const llmKeys = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY'];
      const foundKey = llmKeys.find((k) => parsed[k] || process.env[k]);
      if (foundKey) {
        logSuccess(`${foundKey} is set`);
      } else {
        logWarn('No LLM API key found in .env (set OPENAI_API_KEY or similar)');
      }
    } catch {
      logWarn('.env file exists but could not be parsed');
    }
  } else {
    logWarn('No .env file found');
    allGood = false;
  }

  // 5. Temporal server reachability
  const temporalCfg = resolveTemporalConfig(config);
  const { host, port } = parseAddress(temporalCfg.address);
  const reachable = await isPortReachable(host, port);
  if (reachable) {
    logSuccess(`Temporal server reachable at ${temporalCfg.address}`);
  } else {
    logError(`Temporal server not reachable at ${temporalCfg.address}`);
    logInfo('  → Run `npx durion dev` (starts it automatically) or `temporal server start-dev`');
    allGood = false;
  }

  // 6. Worker file exists
  const workerPath = path.resolve(projectRoot, config.workerPath);
  if (fs.existsSync(workerPath)) {
    logSuccess(`Worker file found: ${config.workerPath}`);
  } else {
    logError(`Worker file not found: ${config.workerPath}`);
    allGood = false;
  }

  // 7. Workflows file exists
  const workflowsPath = path.resolve(projectRoot, config.workflowsPath);
  if (fs.existsSync(workflowsPath)) {
    logSuccess(`Workflows file found: ${config.workflowsPath}`);
  } else {
    logError(`Workflows file not found: ${config.workflowsPath}`);
    allGood = false;
  }

  // 8. @durion/sdk installed
  try {
    require.resolve('@durion/sdk', { paths: [projectRoot] });
    logSuccess('@durion/sdk installed');
  } catch {
    logError('@durion/sdk not found — run npm install @durion/sdk');
    allGood = false;
  }

  logBlank();
  if (allGood) {
    logSuccess('Everything looks good!');
  } else {
    logWarn('Some issues found — see above for fixes.');
  }
  logBlank();
}
