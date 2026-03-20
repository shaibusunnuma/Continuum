import { describe, it, expect } from 'vitest';
import { LocalStreamBus } from '../../src/sdk/streaming/stream-bus';

describe('LocalStreamBus', () => {
  it('publishes and subscribes on a channel', async () => {
    const bus = new LocalStreamBus();
    const received: string[] = [];
    const unsubscribe = await bus.subscribe('c1', (chunk) => {
      if (chunk.type === 'text-delta') received.push(chunk.payload.text);
    });

    bus.publish('c1', { type: 'text-delta', workflowId: 'c1', payload: { text: 'a' } });
    bus.publish('c1', { type: 'text-delta', workflowId: 'c1', payload: { text: 'b' } });
    unsubscribe();
    bus.publish('c1', { type: 'text-delta', workflowId: 'c1', payload: { text: 'c' } });

    expect(received).toEqual(['a', 'b']);
  });
});
