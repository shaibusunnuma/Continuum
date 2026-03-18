/**
 * Streaming example worker.
 * Run: npm run worker:streaming (from repo root).
 * Uses Gemini; set GEMINI_API_KEY in repo root .env.
 */
import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  createRuntime,
  createWorker,
  initObservability,
} from '@ai-runtime/sdk';
import { initEvaluation } from '@ai-runtime/eval';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const TASK_QUEUE = 'ai-runtime-streaming';

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

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
      fast: google('gemini-2.5-flash'),
    },
    tools: [
      {
        name: 'slow_search',
        description: 'Mock a slow search that takes 3 seconds.',
        input: z.object({ query: z.string() }),
        output: z.object({ result: z.string() }),
        execute: async ({ query }) => {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          return { result: `Simulated slow search result for: ${query}` };
        },
      }
    ]
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

  await handle.run();
}

main().catch((err) => {
  console.error('Worker failed:', err);
  process.exit(1);
});
