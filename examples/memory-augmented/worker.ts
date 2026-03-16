/**
 * Memory-Augmented example worker. In-memory stub store for remember_fact/recall.
 * Run: npm run worker:memory-augmented (from repo root).
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

const TASK_QUEUE = 'ai-runtime-memory-augmented';

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

const memory: Array<{ fact: string; key?: string }> = [];

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
    name: 'remember_fact',
    description: 'Store a fact in memory. Use when the user tells you something to remember (e.g. name, preference, event).',
    input: z.object({ fact: z.string(), key: z.string().optional() }),
    output: z.object({ stored: z.boolean(), count: z.number() }),
    execute: async ({ fact, key }) => {
      memory.push({ fact, key });
      return { stored: true, count: memory.length };
    },
  });

  defineTool({
    name: 'recall',
    description: 'Search memory for facts. Returns matching facts (by keyword or key). Use when answering questions about what the user told you.',
    input: z.object({ query: z.string() }),
    output: z.object({ facts: z.array(z.string()) }),
    execute: async ({ query }) => {
      const q = query.toLowerCase();
      const matches = memory.filter(
        (m) =>
          m.fact.toLowerCase().includes(q) ||
          (m.key && m.key.toLowerCase().includes(q)),
      );
      return { facts: matches.map((m) => m.fact) };
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
