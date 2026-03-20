import { EventEmitter } from 'node:events';

/**
 * Ephemeral stream fan-out (first principles)
 *
 * - **Throughput**: From an activity, `publish()` is limited by your worker’s event loop and I/O.
 *   In-process `LocalStreamBus` can handle very high frequency (thousands of small emits/sec).
 *   Redis Pub/Sub is usually network-bound (hundreds–thousands of messages/sec depending on size).
 * - **What we are not (vs Trigger.dev Realtime + Electric SQL)**: There is **no persisted log** of
 *   chunks. Subscribers only see events that arrive **after** they subscribe. Late attach = missed data.
 *   Trigger’s model tees streams into metadata that clients sync from; that gives replay/catch-up.
 * - **Rule**: For token streaming, **open the SSE subscription (or Redis consumer) before starting
 *   the workflow**, and use a **known `workflowId`** as the channel so the activity’s `traceContext`
 *   matches the subscriber’s channel.
 */
export type StreamChunk =
  | { type: 'text-delta'; workflowId: string; payload: { text: string } }
  | { type: 'tool-call'; workflowId: string; payload: unknown }
  | { type: 'tool-result'; workflowId: string; payload: unknown }
  | { type: 'finish'; workflowId: string; payload?: unknown }
  | { type: 'error'; workflowId: string; payload: { message: string } };

export interface StreamBus {
  publish(channel: string, chunk: StreamChunk): void;
  subscribe(channel: string, cb: (chunk: StreamChunk) => void): () => void;
  shutdown?(): Promise<void>;
}

/**
 * In-process StreamBus implementation.
 * Useful when the API server and worker share a process (dev / single-node).
 */
export class LocalStreamBus implements StreamBus {
  private readonly emitter = new EventEmitter();
  // Avoid MaxListenersExceededWarning under many concurrent streaming channels.
  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(channel: string, chunk: StreamChunk): void {
    this.emitter.emit(channel, chunk);
  }

  subscribe(channel: string, cb: (chunk: StreamChunk) => void): () => void {
    this.emitter.on(channel, cb);
    return () => {
      this.emitter.off(channel, cb);
    };
  }
}

