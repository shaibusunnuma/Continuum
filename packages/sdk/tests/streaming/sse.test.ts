import { describe, it, expect } from 'vitest';
import { LocalStreamBus } from '../../src/sdk/streaming/stream-bus';
import { pipeStreamToResponse } from '../../src/sdk/streaming/sse';

describe('pipeStreamToResponse', () => {
  it('writes SSE frames for deltas and finish', async () => {
    const bus = new LocalStreamBus();
    const listeners: Record<string, Function[]> = {};
    const headers: Record<string, unknown> = {};
    const writes: string[] = [];
    let ended = false;
    const res = {
      statusCode: 0,
      setHeader(k: string, v: unknown) {
        headers[k] = v;
      },
      write(x: string) {
        writes.push(x);
      },
      end() {
        ended = true;
      },
      on(event: string, cb: Function) {
        (listeners[event] ??= []).push(cb);
      },
    } as any;

    await pipeStreamToResponse(bus, 'wf-1', res);

    bus.publish('wf-1', { type: 'text-delta', workflowId: 'wf-1', payload: { text: 'hi' } });
    bus.publish('wf-1', { type: 'finish', workflowId: 'wf-1' });

    expect(res.statusCode).toBe(200);
    expect(headers['Content-Type']).toContain('text/event-stream');
    expect(writes.some((w) => w.includes('"type":"text-delta"'))).toBe(true);
    expect(writes.some((w) => w.includes('"type":"finish"'))).toBe(true);
    expect(ended).toBe(true);
  });

  it('stops writing after client disconnect (res close)', async () => {
    const bus = new LocalStreamBus();
    const listeners: Record<string, Function[]> = {};
    const writes: string[] = [];
    const res = {
      setHeader() {},
      write(x: string) {
        writes.push(x);
      },
      end() {},
      on(event: string, cb: Function) {
        (listeners[event] ??= []).push(cb);
      },
    } as any;

    await pipeStreamToResponse(bus, 'wf-2', res);

    bus.publish('wf-2', { type: 'text-delta', workflowId: 'wf-2', payload: { text: 'a' } });

    for (const cb of listeners['close'] ?? []) cb();

    bus.publish('wf-2', { type: 'text-delta', workflowId: 'wf-2', payload: { text: 'b' } });

    expect(writes.some((w) => w.includes('"delta":"a"'))).toBe(true);
    expect(writes.some((w) => w.includes('"delta":"b"'))).toBe(false);
  });
});
