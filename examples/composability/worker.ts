/**
 * Composability example worker (uses createApp).
 * Run from repo root: npm run worker:composability
 * Requires OPENAI_API_KEY in repo root .env and Temporal on TEMPORAL_ADDRESS.
 */
import path from 'path';
import dotenv from 'dotenv';
import { openai } from '@ai-sdk/openai';
import { createApp, initObservability } from '@ai-runtime/sdk';
import { initEvaluation } from '@ai-runtime/eval';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const TASK_QUEUE = 'ai-runtime-composability';

async function main() {
  initObservability({
    tracing: { enabled: true },
    metrics: { enabled: true },
  });

  initEvaluation({
    enabled: false,
    dbUrl: process.env.AI_RUNTIME_EVAL_DB_URL,
    defaultVariantName: process.env.AI_RUNTIME_EVAL_VARIANT,
  });

  const app = await createApp({
    models: {
      fast: openai.chat('gpt-4o-mini'),
    },
    tools: [],
    workflowsPath: require.resolve('./workflows'),
    taskQueue: TASK_QUEUE,
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

  console.log(`Composability worker listening on task queue: ${app.taskQueue}`);
  await handle.run();
}

main().catch((err) => {
  console.error('Worker failed:', err);
  process.exit(1);
});
