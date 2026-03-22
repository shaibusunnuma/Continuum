/**
 * Streaming worker with RedisStreamBus — run alongside `server:streaming-redis`.
 *
 * Prerequisites: Temporal + Redis (e.g. `brew services start redis`).
 *
 * From examples/: npm run worker:streaming-redis
 */
import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  createRuntime,
  createWorker,
  initObservability,
  RedisStreamBus,
} from '@durion/sdk';
import { initEvaluation } from '@durion/eval';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

/** Dedicated queue so this worker does not compete with `worker:streaming` / `server:streaming`. */
const TASK_QUEUE = 'durion-streaming-redis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

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
    dbUrl: process.env.DURION_EVAL_DB_URL,
    defaultVariantName: process.env.DURION_EVAL_VARIANT,
  });

  const streamBus = new RedisStreamBus({ url: REDIS_URL });

  const runtime = createRuntime({
    streaming: { bus: streamBus },
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
      },
    ],
  });

  const handle = await createWorker({
    runtime,
    workflowsPath: require.resolve('./workflows'),
    taskQueue: TASK_QUEUE,
  });

  console.log(`[streaming-redis] Worker on queue ${TASK_QUEUE}, Redis ${REDIS_URL}`);

  const shutdown = (): void => {
    handle
      .shutdown()
      .then(() => streamBus.shutdown?.())
      .catch((err) => {
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
