/**
 * ReAct example worker. Run: npm run worker:react (from repo root: npm run worker:react).
 * Uses OpenAI; set OPENAI_API_KEY in repo root .env.
 */
import path from 'path';
import { z } from 'zod';
import dotenv from 'dotenv';
import { tavily } from '@tavily/core';
import { openai } from '@ai-sdk/openai';
import {
  defineModels,
  defineTool,
  createWorker,
  initObservability,
} from '@ai-runtime/sdk';
import { initEvaluation } from '@ai-runtime/eval';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const TASK_QUEUE = 'ai-runtime-react';
const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });

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
    fast: openai.chat('gpt-4o-mini'),
  });

  defineTool({
    name: 'calculator',
    description: 'Evaluate a simple math expression (e.g. 2 + 3 * 4). Use for arithmetic.',
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

  defineTool({
    name: 'search',
    description: 'Search the web for information. Uses Tavily; good for factual or up-to-date questions.',
    input: z.object({ query: z.string() }),
    output: z.array(
      z.object({
        title: z.string(),
        content: z.string(),
        url: z.string().optional(),
      }),
    ),
    execute: async ({ query }) => {
      const response = await tvly.search(query);
      return response.results.map((result) => ({
        title: result.title,
        content: result.content,
        url: result.url,
      }));
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
