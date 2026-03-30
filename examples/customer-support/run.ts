/**
 * Customer support example — one entry file.
 *
 *   worker — poll Temporal (default). Run in terminal 1.
 *   demo   — start `customerSupport` or `travelAgent` via createClient (terminal 2).
 *
 * From examples/:
 *   npm run worker:customer-support
 *   npm run client:customer-support -- demo customerSupport "I want a refund" ORD-123
 *   npm run client:customer-support -- demo travelAgent "Flights from NYC to London"
 */
import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import {
  createClient,
  createRuntime,
  createWorker,
  durionConfig,
  initObservability,
} from '@durion/sdk';
import { initEvaluation } from '@durion/eval';
import { customerSupport, travelAgent } from './workflows';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

async function runWorker(): Promise<void> {
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
          return [
            { name: 'Grand Hotel', pricePerNight: 180, rating: 4.5 },
            { name: 'Budget Inn', pricePerNight: 75, rating: 3.8 },
          ];
        },
      },
    ],
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

  console.log(`Customer support worker — task queue: ${durionConfig.TASK_QUEUE}`);
  await handle.run();
}

type DemoTarget = 'customerSupport' | 'travelAgent';

async function runDemo(): Promise<void> {
  const sub = process.argv[3] as DemoTarget;
  const args = process.argv.slice(4);

  if (sub !== 'customerSupport' && sub !== 'travelAgent') {
    console.error(
      'Usage: demo customerSupport "<message>" [orderId]  |  demo travelAgent "<message>"',
    );
    process.exit(1);
  }

  const client = await createClient();

  try {
    if (sub === 'customerSupport') {
      let message: string;
      let orderId: string | undefined;
      if (args.length >= 2) {
        orderId = args[args.length - 1];
        message = args.slice(0, -1).join(' ');
      } else {
        message = args.join(' ') || 'I need help with my order';
      }
      console.log('Starting customerSupport:', { message, orderId });
      const handle = await client.start(customerSupport, {
        input: { message, ...(orderId ? { orderId } : {}) },
      });
      console.log(JSON.stringify(await handle.result(), null, 2));
    } else {
      const message =
        args.join(' ') || 'Search for flights from NYC to London on March 15th.';
      console.log('Starting travelAgent:', message);
      const handle = await client.start(travelAgent, {
        input: { message },
      });
      console.log(JSON.stringify(await handle.result(), null, 2));
    }
  } finally {
    await client.close();
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? 'worker';
  if (mode === 'worker') await runWorker();
  else if (mode === 'demo') await runDemo();
  else {
    console.error('Usage: run.ts [worker|demo] ...');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
