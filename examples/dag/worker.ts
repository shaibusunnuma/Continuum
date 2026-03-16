/**
 * DAG example worker. Run: npm run worker:dag (from repo root).
 * Uses Gemini; set GEMINI_API_KEY in repo root .env.
 */
import path from 'path';
import { z } from 'zod';
import dotenv from 'dotenv';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  defineModels,
  defineTool,
  createWorker,
  initObservability,
} from '@ai-runtime/sdk';
import { initEvaluation } from '@ai-runtime/eval';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

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
    fast: google('gemini-2.5-flash'),
  });

  defineTool({
    name: 'calculator',
    description: 'Evaluate a simple math expression.',
    input: z.object({ expression: z.string() }),
    output: z.object({ result: z.number() }),
    execute: async ({ expression }) => {
      try {
        const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
        const result = Function(`"use strict"; return (${sanitized})`)();
        return { result: Number(result) };
      } catch {
        return { result: NaN };
      }
    },
  });

  const handle = await createWorker({
    workflowsPath: require.resolve('./workflows'),
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
