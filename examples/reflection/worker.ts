/**
 * Reflection example worker. Run: npm run worker:reflection (from repo root).
 * Uses Gemini; set GEMINI_API_KEY in repo root .env.
 */
import path from 'path';
import dotenv from 'dotenv';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  defineModels,
  createWorker,
  initObservability,
} from '@ai-runtime/sdk';
import { initEvaluation } from '@ai-runtime/eval';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const TASK_QUEUE = 'ai-runtime-reflection';

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

async function main() {
  initObservability({
    tracing: { enabled: true },
    metrics: { enabled: true },
  });

  initEvaluation({
    enabled: process.env.AI_RUNTIME_EVAL_ENABLED === '1',
    dbUrl: process.env.AI_RUNTIME_EVAL_DB_URL,
    defaultVariantName: process.env.AI_RUNTIME_EVAL_VARIANT,
  });

  defineModels({
    fast: google('gemini-2.5-flash'),
  });

  const handle = await createWorker({
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

  await handle.run();
}

main().catch((err) => {
  console.error('Worker failed:', err);
  process.exit(1);
});
