/**
 * HTTP API that subscribes to RedisStreamBus SSE — worker runs in another process.
 *
 * Prerequisites: Temporal + Redis + `npm run worker:streaming-redis`
 *
 * From examples/: npm run server:streaming-redis
 * Then: curl -sN -X POST http://localhost:4001/stream -H "Content-Type: application/json" -d '{"message":"Say hi in one sentence."}'
 */
import path from 'path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import http from 'node:http';
import { z } from 'zod';
import { createClient, pipeStreamToResponse, RedisStreamBus } from '@ai-runtime/sdk';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const TASK_QUEUE = 'ai-runtime-streaming-redis';
const PORT = 4001;
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

async function main() {
  const bus = new RedisStreamBus({ url: REDIS_URL });
  const client = await createClient();

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

      const workflowId = `streaming-redis-${crypto.randomUUID()}`;

      try {
        await pipeStreamToResponse(bus, workflowId, res);
      } catch (err) {
        console.error('[streaming-redis] SSE setup failed:', err);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end('stream setup failed');
        }
        return;
      }

      const handle = await client.startWorkflow('streamingWorkflow', {
        taskQueue: TASK_QUEUE,
        workflowId,
        input: { message: check.data.message },
      });

      void handle.result().catch((err) => {
        bus.publish(workflowId, {
          type: 'error',
          workflowId,
          payload: { message: (err as Error)?.message ?? String(err) },
        });
      });
    });
  });

  server.listen(PORT, () => {
    console.log(
      `[streaming-redis] API http://localhost:${PORT}/stream (Redis ${REDIS_URL}, queue ${TASK_QUEUE})`,
    );
  });

  const shutdown = async () => {
    server.close();
    await client.close();
    await bus.shutdown();
  };
  process.on('SIGINT', () => void shutdown().then(() => process.exit(0)));
  process.on('SIGTERM', () => void shutdown().then(() => process.exit(0)));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
