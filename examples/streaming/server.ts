/**
 * Token streaming example server.
 *
 * Runs a Temporal worker + an HTTP server in the same process so LocalStreamBus works
 * without extra infrastructure.
 *
 * Run: npm run server:streaming
 * Then: curl -sN -X POST http://localhost:4000/stream -H "Content-Type: application/json" -d '{"message":"Write a short poem about Temporal."}'
 */
import path from 'path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import http from 'node:http';
import { z } from 'zod';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  createRuntime,
  createWorker,
  createClient,
  pipeStreamToResponse,
} from '@durion/sdk';
import { streamingWorkflow } from './workflows';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const TASK_QUEUE = 'durion-streaming';
const PORT = 4000;

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

async function main() {
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

  const worker = await createWorker({
    runtime,
    workflowsPath: require.resolve('./workflows'),
    taskQueue: TASK_QUEUE,
  });

  const client = await createClient({ taskQueue: TASK_QUEUE });

  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/stream') {
      res.statusCode = 404;
      res.end('not found');
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString('utf8');
    });
    req.on('end', async () => {
      const parsed = (() => {
        try {
          return JSON.parse(body);
        } catch {
          return null;
        }
      })();
      const schema = z.object({ message: z.string().min(1) });
      const check = schema.safeParse(parsed);
      if (!check.success) {
        res.statusCode = 400;
        res.end('invalid body');
        return;
      }

      // Channel id must match workflow id (runModel uses traceContext.workflowId).
      // Subscribe *before* starting the workflow: LocalStreamBus has no buffer — events published
      // before subscribe are dropped (no persisted replay buffer).
      const workflowId = `streaming-sse-${crypto.randomUUID()}`;
      await pipeStreamToResponse(runtime.streamBus, workflowId, res);

      const handle = await client.start(streamingWorkflow, {
        workflowId,
        input: { message: check.data.message },
      });

      // If the workflow fails without the activity emitting finish/error on the bus, end the SSE.
      void handle.result().catch((err) => {
        runtime.streamBus.publish(workflowId, {
          type: 'error',
          workflowId,
          payload: { message: (err as Error)?.message ?? String(err) },
        });
      });
    });
  });

  server.listen(PORT, () => {
    console.log(`[streaming] HTTP server listening on http://localhost:${PORT}`);
  });

  const shutdown = async () => {
    server.close();
    await worker.shutdown();
    await client.close();
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  await worker.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

