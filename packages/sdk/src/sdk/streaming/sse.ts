import type { ServerResponse } from 'node:http';
import { UI_MESSAGE_STREAM_HEADERS } from 'ai';
import type { StreamBus, StreamChunk } from './stream-bus';

/**
 * Subscribe to a workflow's StreamBus channel and pipe events to an HTTP response
 * using the Vercel AI SDK UI Message Stream protocol (SSE).
 *
 * **Await this, then start the workflow** (and pass the same `workflowId` to Temporal):
 * `LocalStreamBus` drops events with no listeners; Redis Pub/Sub drops messages if subscribe
 * is not active yet — this function awaits until the subscription is ready.
 *
 * The subscription is automatically cleaned up when the stream finishes, when an
 * error occurs, or when the HTTP client disconnects.
 */
export async function pipeStreamToResponse(
  bus: StreamBus,
  workflowId: string,
  res: ServerResponse,
): Promise<void> {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  for (const [k, v] of Object.entries(UI_MESSAGE_STREAM_HEADERS)) {
    res.setHeader(k, v as any);
  }

  res.write('\n');

  let settled = false;
  let unsubscribe: () => void = () => {};

  const done = () => {
    if (settled) return;
    settled = true;
    unsubscribe();
    try {
      res.end();
    } catch {
      // ignore
    }
  };

  const writePart = (part: unknown) => {
    res.write(`data: ${JSON.stringify(part)}\n\n`);
  };

  res.on('close', done);

  try {
    unsubscribe = await bus.subscribe(workflowId, (chunk: StreamChunk) => {
      if (settled) return;
      if (chunk.type === 'text-delta') {
        writePart({ type: 'text-delta', delta: chunk.payload.text });
        return;
      }
      if (chunk.type === 'tool-call') {
        writePart({ type: 'tool-call', ...(chunk.payload as Record<string, unknown>) });
        return;
      }
      if (chunk.type === 'tool-result') {
        writePart({ type: 'tool-result', ...(chunk.payload as Record<string, unknown>) });
        return;
      }
      if (chunk.type === 'error') {
        writePart({ type: 'error', error: chunk.payload.message });
        done();
        return;
      }
      if (chunk.type === 'finish') {
        writePart({ type: 'finish' });
        done();
      }
    });
  } catch {
    if (!settled) {
      writePart({ type: 'error', error: 'Stream subscription failed' });
      done();
    }
  }
}
