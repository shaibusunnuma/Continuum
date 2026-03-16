/**
 * Cognitive/Layered example worker. Run: npm run worker:cognitive-layered (from repo root).
 * Uses OpenAI; set OPENAI_API_KEY in repo root .env.
 */
import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import {
  defineModels,
  defineTool,
  createWorker,
  initObservability,
} from '@ai-runtime/sdk';
import { initEvaluation } from '@ai-runtime/eval';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const TASK_QUEUE = 'ai-runtime-cognitive-layered';

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
    fast: openai.chat('gpt-4o-mini'),
    reasoning: openai.chat('gpt-4o'),
  });

  defineTool({
    name: 'get_time',
    description: 'Return the current date and time in ISO and a short, human-readable form.',
    input: z.object({}),
    output: z.object({
      iso: z.string(),
      human: z.string(),
    }),
    execute: async () => {
      const now = new Date();
      return {
        iso: now.toISOString(),
        human: now.toLocaleString(),
      };
    },
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
