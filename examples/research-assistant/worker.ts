/**
 * Research assistant example worker.
 * Run from examples: npm run worker:research-assistant
 * Set GEMINI_API_KEY in repo root .env.
 */
import path from 'path';
import dotenv from 'dotenv';
import { tavily } from "@tavily/core";

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { z } from 'zod';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  createRuntime,
  createWorker,
  initObservability,
} from '@durion/sdk';
import { initEvaluation } from '@durion/eval';


const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });

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

  const runtime = createRuntime({
    models: {
      fast: google('gemini-2.5-flash'),
      reasoning: google('gemini-2.5-pro'),
    },
    tools: [
      {
        name: 'search_web',
        description: 'Search the web for information. Use for factual or up-to-date queries.',
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
        }
      },
      {
        name: 'save_note',
        description: 'Save a research note or finding for the summary.',
        input: z.object({
          content: z.string(),
          label: z.string().optional(),
        }),
        output: z.object({ saved: z.boolean(), id: z.string() }),
        execute: async () => ({ saved: true, id: `note-${Date.now()}` }),
      }
    ]
  });

  const handle = await createWorker({
    runtime,
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
