/**
 * Human-in-the-loop example — one entry file.
 *
 *   worker — Temporal worker (terminal 1). Uses RedisStreamBus (REDIS_URL) so token SSE from
 *            example-server reaches the same channels as runModel(..., { stream: true }).
 *   demo   — start draftEmail + signals via createClient (terminal 2).
 *
 * For the React UI, see examples/react-hitl-ui/README.md (Temporal + Redis + api:dev + ui:hitl).
 */
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  createClient,
  createRuntime,
  createWorker,
  durionConfig,
  initObservability,
  RedisStreamBus,
} from '@durion/sdk';
import { initEvaluation } from '@durion/eval';
import { draftEmail } from './workflows';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

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
    tools: [],
    streaming: { bus: new RedisStreamBus({ url: REDIS_URL }) },
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

  console.log(`HITL worker — task queue: ${durionConfig.TASK_QUEUE}, RedisStreamBus: ${REDIS_URL}`);
  await handle.run();
}

async function runDemo(): Promise<void> {
  const client = await createClient();

  const runId = crypto.randomBytes(4).toString('hex');
  const workflowId = `hitl-${runId}`;

  console.log('Starting email drafter workflow...');
  const handle = await client.start(draftEmail, {
    workflowId,
    input: { topic: 'Announcing a new 20% discount on all cloud services on Friday' },
  });

  console.log(`Workflow started (ID: ${workflowId}). Waiting for first draft...`);

  const waitUntilWaiting = async () => {
    while (true) {
      const state = await handle.queryStreamState();
      if (state.status === 'waiting_for_input') return state;
      if (state.status === 'completed') return state;
      await new Promise((r) => setTimeout(r, 1000));
    }
  };

  const state1 = await waitUntilWaiting();
  console.log('\n--- First Draft Generated ---');
  console.log(`Workflow status: ${state1.status}`);

  console.log('\nRejecting first draft with feedback...');
  await handle.signal('durion:user-input', {
    action: 'reject',
    feedback: 'Make it sound more urgent and use emojis!',
  });

  console.log('Signal sent. Waiting for second draft...');
  const state2 = await waitUntilWaiting();
  console.log('\n--- Second Draft Generated ---');
  console.log(`Workflow status: ${state2.status}`);

  console.log('\nApproving second draft...');
  await handle.signal('durion:user-input', { action: 'approve' });

  console.log('Signal sent. Waiting for final result...');
  const result = await handle.result();

  console.log('\n--- Final Approved Email ---');
  console.log((result as { finalEmail?: string }).finalEmail);
  console.log('----------------------------');

  await client.close();
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? 'worker';
  if (mode === 'worker') await runWorker();
  else if (mode === 'demo') await runDemo();
  else {
    console.error('Usage: run.ts [worker|demo]');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
