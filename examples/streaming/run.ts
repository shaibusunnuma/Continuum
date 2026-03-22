/**
 * Streaming example — one entry file.
 *
 *   worker — Temporal worker (terminal 1).
 *   demo   — start streamingAgent + poll streamState via createClient (terminal 2).
 *
 * Co-located worker + HTTP SSE: use npm run server:streaming (unchanged).
 */
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { z } from 'zod';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createClient, createRuntime, createWorker, initObservability } from '@durion/sdk';
import { initEvaluation } from '@durion/eval';
import { streamingAgent } from './workflows';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const TASK_QUEUE = 'durion-streaming';

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

async function runWorker(): Promise<void> {
  initObservability({ tracing: { enabled: true }, metrics: { enabled: true } });
  initEvaluation({
    enabled: false,
    dbUrl: process.env.DURION_EVAL_DB_URL,
    defaultVariantName: process.env.DURION_EVAL_VARIANT,
  });

  const runtime = createRuntime({
    models: { fast: google('gemini-2.5-flash') },
    tools: [
      {
        name: 'slow_search',
        description: 'Mock a slow search that takes 3 seconds.',
        input: z.object({ query: z.string() }),
        output: z.object({ result: z.string() }),
        execute: async ({ query }) => {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          return { result: `Simulated slow search result for: ${query}` };
        },
      },
    ],
  });

  const handle = await createWorker({
    runtime,
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

  console.log(`Streaming worker — task queue: ${TASK_QUEUE}`);
  await handle.run();
}

async function runDemo(): Promise<void> {
  const query = process.argv.slice(3).join(' ') || 'Research the history of UNIX.';

  const client = await createClient({ taskQueue: TASK_QUEUE });

  console.log('Starting streaming agent:', query);
  console.log('--------------------------------------------------');

  const runId = crypto.randomBytes(4).toString('hex');
  const handle = await client.start(streamingAgent, {
    workflowId: `streaming-${runId}`,
    input: { message: query },
  });

  const interval = setInterval(async () => {
    try {
      const state = await handle.queryStreamState();
      const messages = state.messages ?? [];
      const lastMessage = messages[messages.length - 1];
      const role = lastMessage ? lastMessage.role : 'none';
      const steps = state.currentStep;
      let indicator = 'running';
      if (state.status === 'completed') indicator = 'done';
      else if (state.status === 'waiting_for_input') indicator = 'waiting';
      console.log(
        `[${indicator}] Step ${steps} | Status: ${state.status} | Last Role: ${role} | Updated: ${state.updatedAt}`,
      );
      if (state.partialReply) {
        console.log(`   Partial reply: ...${state.partialReply.slice(-50)}`);
      }
    } catch (err) {
      console.error('Error querying state:', (err as Error).message);
    }
  }, 1500);

  try {
    const result = await handle.result();
    console.log('--------------------------------------------------');
    console.log('Final Result:', (result as { reply?: string }).reply);
  } finally {
    clearInterval(interval);
    await client.close();
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? 'worker';
  if (mode === 'worker') await runWorker();
  else if (mode === 'demo') await runDemo();
  else {
    console.error('Usage: run.ts [worker|demo] [query...]');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
