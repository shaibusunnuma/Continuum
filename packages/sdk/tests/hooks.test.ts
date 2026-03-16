import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerHook, dispatchHooks, clearHooks } from '../src/sdk/hooks';
import type { LifecycleEvent } from '../src/sdk/hooks';

const sampleEvent: LifecycleEvent = {
  type: 'run:complete',
  payload: {
    kind: 'workflow',
    name: 'testWorkflow',
    workflowId: 'wf-1',
    runId: 'run-1',
    input: { x: 1 },
    output: { y: 2 },
  },
};

describe('hooks', () => {
  beforeEach(() => {
    clearHooks();
  });

  it('calls registered hook with event', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    registerHook(fn);
    await dispatchHooks(sampleEvent);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(sampleEvent);
  });

  it('calls multiple hooks in order', async () => {
    const order: number[] = [];
    registerHook(async () => { order.push(1); });
    registerHook(async () => { order.push(2); });
    registerHook(async () => { order.push(3); });
    await dispatchHooks(sampleEvent);
    expect(order).toEqual([1, 2, 3]);
  });

  it('continues calling hooks when one throws', async () => {
    const second = vi.fn().mockResolvedValue(undefined);
    registerHook(async () => { throw new Error('hook1 failed'); });
    registerHook(second);
    await dispatchHooks(sampleEvent);
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith(sampleEvent);
  });

  it('clearHooks removes all hooks', async () => {
    const fn = vi.fn();
    registerHook(fn);
    clearHooks();
    await dispatchHooks(sampleEvent);
    expect(fn).not.toHaveBeenCalled();
  });
});
