/**
 * Multi-agent example — one entry file.
 *
 *   worker      — Temporal worker (terminal 1). Registers Pattern A + Pattern B agents.
 *   orchestrate — Pattern B chain via createClient (terminal 2).
 */
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  createClient,
  createRuntime,
  createWorker,
  initObservability,
  type AgentResult,
} from '@ai-runtime/sdk';
import { initEvaluation } from '@ai-runtime/eval';
import { researchAgent, coderAgent, analystAgent } from './workflows';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const TASK_QUEUE = 'ai-runtime-multi-agent';

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

async function runWorker(): Promise<void> {
  initObservability({ tracing: { enabled: true }, metrics: { enabled: true } });
  initEvaluation({
    enabled: false,
    dbUrl: process.env.AI_RUNTIME_EVAL_DB_URL,
    defaultVariantName: process.env.AI_RUNTIME_EVAL_VARIANT,
  });

  const runtime = createRuntime({
    models: { fast: google('gemini-2.5-flash') },
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

  console.log(`Multi-agent worker — task queue: ${TASK_QUEUE}`);
  await handle.run();
}

async function runOrchestrate(): Promise<void> {
  const query = process.argv.slice(3).join(' ');
  console.log('Query:', query);
  console.log('Pattern B: researchAgent -> coderAgent -> analystAgent\n');

  const client = await createClient({ taskQueue: TASK_QUEUE });
  const runId = crypto.randomBytes(4).toString('hex');

  try {
    const researchHandle = await client.start(researchAgent, {
      workflowId: `multi-b-${runId}-research`,
      input: { message: query },
    });
    const researchResult = (await researchHandle.result()) as AgentResult;
    const researchReply = researchResult.reply ?? '';

    const coderHandle = await client.start(coderAgent, {
      workflowId: `multi-b-${runId}-coder`,
      input: { message: researchReply },
    });
    const coderResult = (await coderHandle.result()) as AgentResult;
    const coderReply = coderResult.reply ?? '';

    const analystHandle = await client.start(analystAgent, {
      workflowId: `multi-b-${runId}-analyst`,
      input: { message: coderReply },
    });
    const analystResult = (await analystHandle.result()) as AgentResult;
    const analystReply = analystResult.reply ?? '';

    console.log('Research:', researchReply);
    console.log('Coder:', coderReply);
    console.log('Analyst:', analystReply);
  } finally {
    await client.close();
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? 'worker';
  if (mode === 'worker') await runWorker();
  else if (mode === 'orchestrate') await runOrchestrate();
  else {
    console.error('Usage: run.ts [worker|orchestrate] [query...]');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
