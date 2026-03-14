/**
 * Example worker entry point.
 *
 * Configures models, registers tools, and starts the Temporal worker.
 * Run with: ts-node examples/worker.ts
 *
 * Install only the provider packages you use: npm install @ai-sdk/openai
 */
import '../src/shared/config';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import {
  defineModels,
  defineTool,
  createWorker,
  initObservability,
  initEvaluation,
} from '../src/sdk';
import { startTelemetry } from '../src/otel';

async function main() {
  // await startTelemetry();

  // initObservability({
  //   tracing: { enabled: process.env.AI_RUNTIME_ENABLE_TRACING === '1' },
  //   metrics: { enabled: process.env.AI_RUNTIME_ENABLE_METRICS === '1' },
  // });

  initEvaluation({
    enabled: process.env.AI_RUNTIME_EVAL_ENABLED === '1',
    dbUrl: process.env.AI_RUNTIME_EVAL_DB_URL,
    defaultVariantName: process.env.AI_RUNTIME_EVAL_VARIANT,
  });

  // -------------------------------------------------------------------------
  // 1. Register models (pass Vercel AI SDK LanguageModel instances)
  // -------------------------------------------------------------------------

  defineModels({
    fast: openai.chat('gpt-4o-mini'),
    reasoning: openai.chat('gpt-4o'),
  });

  // -------------------------------------------------------------------------
  // 2. Register tools
  // -------------------------------------------------------------------------

  defineTool({
    name: 'fetch_order',
    description: 'Look up an order by ID and return its status and total',
    input: z.object({ orderId: z.string() }),
    output: z.object({ status: z.string(), total: z.number() }),
    execute: async ({ orderId }) => {
      // Stub — in production this would hit a database
      return { status: 'shipped', total: 42.0 };
    },
  });

  defineTool({
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
  });

  defineTool({
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
  });

  // -------------------------------------------------------------------------
  // 3. Start worker
  // -------------------------------------------------------------------------

  await createWorker({
    workflowsPath: require.resolve('./workflows'),
  });
}

main().catch((err) => {
  console.error('Worker failed:', err);
  process.exit(1);
});
