/**
 * Composability example — one entry file.
 *
 *   worker  — poll Temporal (default). Run in terminal 1.
 *   demo    — start workflows via createClient (terminal 2; worker must be running).
 *             Same file shows both sides; a real second app would copy only the demo + createClient pattern.
 *
 * From repo root:
 *   npm run worker:composability
 *   npm run client:composability -- parent "hello world"
 *   npm run client:composability -- orchestrator "Ask the specialist: what is 2+2?"
 */
import path from 'path';
import dotenv from 'dotenv';
import { openai } from '@ai-sdk/openai';
import { createApp, createClient, initObservability } from '@ai-runtime/sdk';
import { initEvaluation } from '@ai-runtime/eval';
import { composabilityParent, composabilityOrchestrator } from './workflows';
import { COMPOSABILITY_TASK_QUEUE } from './temporal-config';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

async function runWorker(): Promise<void> {
  initObservability({ tracing: { enabled: true }, metrics: { enabled: true } });
  initEvaluation({
    enabled: false,
    dbUrl: process.env.AI_RUNTIME_EVAL_DB_URL,
    defaultVariantName: process.env.AI_RUNTIME_EVAL_VARIANT,
  });

  const app = await createApp({
    models: { fast: openai.chat('gpt-4o-mini') },
    tools: [],
    workflowsPath: require.resolve('./workflows'),
    taskQueue: COMPOSABILITY_TASK_QUEUE,
  });

  const handle = await app.createWorker();
  const shutdown = (): void => {
    handle.shutdown().catch((err) => {
      console.error('Worker shutdown error:', err);
      process.exit(1);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`Composability worker — task queue: ${COMPOSABILITY_TASK_QUEUE}`);
  await handle.run();
}

type DemoMode = 'parent' | 'orchestrator';

async function runDemo(): Promise<void> {
  const sub = (process.argv[3] ?? 'parent') as DemoMode;
  const text = process.argv.slice(4).join(' ') || 'hello composability';

  if (sub !== 'parent' && sub !== 'orchestrator') {
    console.error('Usage: demo parent|orchestrator "<message>"');
    process.exit(1);
  }

  /**
   * Remote / second process: only this block (plus env) is required — same TEMPORAL_ADDRESS,
   * TEMPORAL_NAMESPACE, and TASK_QUEUE as the worker. See examples/REMOTE_CLIENT.md.
   */
  const client = await createClient({ taskQueue: COMPOSABILITY_TASK_QUEUE });

  try {
    if (sub === 'parent') {
      console.log('Starting composabilityParent:', text);
      const handle = await client.start(composabilityParent, { input: { message: text } });
      console.log(JSON.stringify(await handle.result(), null, 2));
    } else {
      console.log('Starting composabilityOrchestrator:', text);
      const handle = await client.start(composabilityOrchestrator, { input: { message: text } });
      console.log(JSON.stringify(await handle.result(), null, 2));
    }
  } finally {
    await client.close();
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? 'worker';
  if (mode === 'worker') await runWorker();
  else if (mode === 'demo') await runDemo();
  else {
    console.error('Usage: run.ts [worker|demo] ...');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
