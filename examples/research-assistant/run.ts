/**
 * Research assistant example — one entry file.
 *
 *   worker — poll Temporal (default). Run in terminal 1. Set GEMINI_API_KEY (and optional TAVILY_API_KEY) in repo root `.env`.
 *   demo   — start `contentBrief` or `researchAssistant` via createClient (terminal 2).
 *
 * From examples/:
 *   npm run worker:research-assistant
 *   npm run client:research-assistant -- demo contentBrief "Your topic" B2B
 *   npm run client:research-assistant -- demo researchAssistant "Your question"
 */
import path from 'path';
import dotenv from 'dotenv';
import { tavily } from '@tavily/core';
import { z } from 'zod';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  createClient,
  createRuntime,
  createWorker,
  initObservability,
} from '@durion/sdk';
import { initEvaluation } from '@durion/eval';
import { contentBrief, researchAssistant } from './workflows';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });

/** Matches example-server agent routing for `researchAssistant`. */
const TASK_QUEUE = 'durion-research-assistant';

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
      fast: google('gemini-2.5-flash'),
      reasoning: google('gemini-2.5-pro'),
    },
    tools: [
      {
        name: 'search_web',
        description:
          'Search the web for information. Use for factual or up-to-date queries.',
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

  console.log(`Research assistant worker — task queue: ${TASK_QUEUE}`);
  await handle.run();
}

type DemoTarget = 'contentBrief' | 'researchAssistant';

async function runDemo(): Promise<void> {
  const sub = process.argv[3] as DemoTarget;
  const args = process.argv.slice(4);

  if (sub !== 'contentBrief' && sub !== 'researchAssistant') {
    console.error(
      'Usage: demo contentBrief "<topic>" [audience]  |  demo researchAssistant "<message>"',
    );
    process.exit(1);
  }

  const client = await createClient({ taskQueue: TASK_QUEUE });

  try {
    if (sub === 'contentBrief') {
      const topic =
        args[0] ?? 'Sustainable packaging in e-commerce';
      const audience = args[1] ?? 'B2B';
      console.log('Starting contentBrief:', { topic, audience });
      const handle = await client.start(contentBrief, {
        input: { topic, audience },
      });
      console.log(JSON.stringify(await handle.result(), null, 2));
    } else {
      const message =
        args.join(' ') || 'What is one recent development in renewable energy?';
      console.log('Starting researchAssistant:', message);
      const handle = await client.start(researchAssistant, {
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
