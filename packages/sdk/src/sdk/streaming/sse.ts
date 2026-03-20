import type { ServerResponse } from 'node:http';
import { UI_MESSAGE_STREAM_HEADERS } from 'ai';
import type { StreamBus, StreamChunk } from './stream-bus';

/**
 * Subscribe to a workflow's StreamBus channel and pipe events to an HTTP response
 * using the Vercel AI SDK UI Message Stream protocol (SSE).
 *
 * **Subscribe before starting the workflow** (and pass the same `workflowId` to Temporal):
 * the default `LocalStreamBus` does not buffer; chunks published before this call are lost.
 *
 * The subscription is automatically cleaned up when the stream finishes, when an
 * error occurs, or when the HTTP client disconnects.
 */
export function pipeStreamToResponse(
  bus: StreamBus,
  workflowId: string,
  res: ServerResponse,
): void {
  // Write headers for SSE. We include Vercel AI SDK UI stream header so
  // clients like `useChat` can detect the protocol.
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  for (const [k, v] of Object.entries(UI_MESSAGE_STREAM_HEADERS)) {
    res.setHeader(k, v as any);
  }

  // Best-effort initial flush.
  res.write('\n');

  let settled = false;
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
    // SSE frame: `data: <json>\n\n`
    res.write(`data: ${JSON.stringify(part)}\n\n`);
  };

  const unsubscribe = bus.subscribe(workflowId, (chunk: StreamChunk) => {
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

  res.on('close', done);
}
