/**
 * Example worker entry point.
 *
 * Configures models, registers tools, and starts the Temporal worker.
 * Run from repo root: npm run build && npm run worker:examples
 *
 * Install only the provider packages you use: npm install @ai-sdk/openai
 */
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import {
  createRuntime,
  createWorker,
  initObservability,
} from '@ai-runtime/sdk';
import { initEvaluation } from '@ai-runtime/eval';

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

  // -------------------------------------------------------------------------
  // 1. Create runtime with models and tools
  // -------------------------------------------------------------------------

  const runtime = createRuntime({
    models: {
      fast: openai.chat('gpt-4o-mini'),
      reasoning: openai.chat('gpt-4o'),
    },
    tools: [
      {
        name: 'fetch_order',
        description: 'Look up an order by ID and return its status and total',
        input: z.object({ orderId: z.string() }),
        output: z.object({ status: z.string(), total: z.number() }),
        execute: async ({ orderId }) => {
          // Stub — in production this would hit a database
          return { status: 'shipped', total: 42.0 };
        },
      },
      {
        name: 'search_flights',
        description: 'Search for available flights between two cities',
        input: z.object({
          from: z.string(),
          to: z.string(),
          date: z.string().optional(),
        }),
        output: z.array(
          z.object({
            airline: z.string(),
            price: z.number(),
            departure: z.string(),
          }),
        ),
        execute: async ({ from, to }) => {
          // Stub
          return [
            { airline: 'SkyAir', price: 350, departure: '08:00' },
            { airline: 'CloudJet', price: 420, departure: '14:30' },
          ];
        },
      },
      {
        name: 'search_hotels',
        description: 'Search for available hotels in a city',
        input: z.object({
          city: z.string(),
          checkIn: z.string().optional(),
          checkOut: z.string().optional(),
        }),
        output: z.array(
          z.object({
            name: z.string(),
            pricePerNight: z.number(),
            rating: z.number(),
          }),
        ),
        execute: async ({ city }) => {
          // Stub
          return [
            { name: 'Grand Hotel', pricePerNight: 180, rating: 4.5 },
            { name: 'Budget Inn', pricePerNight: 75, rating: 3.8 },
          ];
        },
      },
    ],
  });

  // -------------------------------------------------------------------------
  // 3. Start worker
  // -------------------------------------------------------------------------

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
