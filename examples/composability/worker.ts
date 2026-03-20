/**
 * Composability example worker.
 * Run from repo root: npm run worker:composability
 * Requires OPENAI_API_KEY in repo root .env and Temporal on TEMPORAL_ADDRESS.
 */
import path from 'path';
import dotenv from 'dotenv';
import { openai } from '@ai-sdk/openai';
import { createRuntime, createWorker, initObservability } from '@ai-runtime/sdk';
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

  const runtime = createRuntime({
    models: {
      fast: openai.chat('gpt-4o-mini'),
    },
    tools: [],
  });

  const handle = await createWorker({
    runtime,
    workflowsPath: require.resolve('./workflows'),
    taskQueue: TASK_QUEUE,
  });

  const shutdown = (): void => {
    handle.shutdown().catch((err) => {
      console.error('Worker shutdown error:', err);
      process.exit(1);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`Composability worker listening on task queue: ${TASK_QUEUE}`);
  await handle.run();
}

main().catch((err) => {
  console.error('Worker failed:', err);
  process.exit(1);
});
