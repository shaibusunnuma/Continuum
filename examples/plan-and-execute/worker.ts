/**
 * Plan-and-Execute example worker. Run: npm run worker:plan-and-execute (from repo root).
 * Uses OpenAI; set OPENAI_API_KEY in repo root .env.
 */
import path from 'path';
import { z } from 'zod';
import dotenv from 'dotenv';
import { openai } from '@ai-sdk/openai';
import {
  defineModels,
  defineTool,
  createWorker,
  initObservability,
} from '@ai-runtime/sdk';
import { initEvaluation } from '@ai-runtime/eval';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const TASK_QUEUE = 'ai-runtime-plan-and-execute';

async function main() {
  initObservability({
    tracing: { enabled: process.env.AI_RUNTIME_ENABLE_TRACING === '1' },
    metrics: { enabled: process.env.AI_RUNTIME_ENABLE_METRICS === '1' },
  });

  initEvaluation({
    enabled: process.env.AI_RUNTIME_EVAL_ENABLED === '1',
    dbUrl: process.env.AI_RUNTIME_EVAL_DB_URL,
    defaultVariantName: process.env.AI_RUNTIME_EVAL_VARIANT,
  });

  defineModels({
    fast: openai.chat('gpt-5.1-2025-11-13'),
  });

  defineTool({
    name: 'calculator',
    description:
      'Evaluate a simple math expression. Allowed characters: digits, +, -, *, /, parentheses, and spaces. No functions or variables.',
    input: z.object({ expression: z.string() }),
    output: z.object({ result: z.number() }),
    execute: async ({ expression }) => {
      try {
        const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
        const result = Function(`"use strict"; return (${sanitized})`)();
        const numeric = Number(result);
        if (!Number.isFinite(numeric)) {
          return { result: NaN };
        }
        return { result: numeric };
      } catch {
        return { result: NaN };
      }
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
