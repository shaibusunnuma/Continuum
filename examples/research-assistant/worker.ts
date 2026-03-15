/**
 * Research assistant example worker.
 * Run from examples: npm run worker:research-assistant
 * Set GEMINI_API_KEY in repo root .env.
 */
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { z } from 'zod';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  defineModels,
  defineTool,
  createWorker,
  initObservability,
} from '@ai-runtime/sdk';
import { initEvaluation } from '@ai-runtime/eval';

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
    fast: google('gemini-2.0-flash'),
    reasoning: google('gemini-1.5-pro'),
  });

  defineTool({
    name: 'search_web',
    description: 'Search the web for information. Use for factual or up-to-date queries.',
    input: z.object({ query: z.string() }),
    output: z.array(
      z.object({
        title: z.string(),
        snippet: z.string(),
        url: z.string().optional(),
      }),
    ),
    execute: async ({ query }) => [
      {
        title: `Results for: ${query}`,
        snippet: `Sample snippet for "${query}". Replace with real search API (e.g. Serper, Tavily).`,
        url: 'https://example.com',
      },
    ],
  });

  defineTool({
    name: 'save_note',
    description: 'Save a research note or finding for the summary.',
    input: z.object({
      content: z.string(),
      label: z.string().optional(),
    }),
    output: z.object({ saved: z.boolean(), id: z.string() }),
    execute: async () => ({ saved: true, id: `note-${Date.now()}` }),
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
