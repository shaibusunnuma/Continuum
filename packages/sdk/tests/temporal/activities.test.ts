import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { runModel, runTool, runLifecycleHooks } from '../../src/sdk/temporal/activities';
import { ToolValidationError } from '../../src/sdk/errors';
import type { LifecycleEvent } from '../../src/sdk/hooks';
import { createRuntime, setActiveRuntime, clearActiveRuntime } from '../../src/sdk/runtime';

const fakeModel: LanguageModel = {
  specificationVersion: 'v2',
  provider: 'openai',
  modelId: 'gpt-4o-mini',
} as LanguageModel;

vi.mock('../../src/sdk/ai/cost', () => ({
  calculateCostUsd: vi.fn().mockResolvedValue(0.001),
}));

vi.mock('../../src/sdk/obs', () => ({
  withSpan: vi.fn((_name: string, _attrs: unknown, fn: (span: null) => Promise<unknown>) => fn(null)),
}));

vi.mock('../../src/sdk/obs-metrics', () => ({
  recordModelCall: vi.fn(),
  recordModelTokens: vi.fn(),
  recordModelCost: vi.fn(),
  recordToolCall: vi.fn(),
}));

vi.mock('ai', () => ({
  generateText: vi.fn(),
  generateObject: vi.fn(),
  streamText: vi.fn(),
  jsonSchema: vi.fn((s: unknown) => s),
  tool: vi.fn(() => ({})),
  Output: { object: vi.fn(() => ({})) },
}));

import { generateText, streamText } from 'ai';

describe('activities', () => {
  beforeEach(() => {
    vi.mocked(generateText).mockClear();

    // Set up a runtime with one model and one tool
    const runtime = createRuntime({
      models: { fast: fakeModel },
      tools: [
        {
          name: 'calculator',
          description: 'Calc',
          input: z.object({ expression: z.string() }),
          output: z.object({ result: z.number() }),
          execute: vi.fn().mockResolvedValue({ result: 42 }),
        },
      ],
    });
    setActiveRuntime(runtime);
  });

  afterEach(() => {
    clearActiveRuntime();
  });

  describe('runModel', () => {
    it('returns content and usage from generateText', async () => {
      vi.mocked(generateText).mockResolvedValue({
        text: 'Hello',
        usage: { inputTokens: 10, outputTokens: 5 },
        toolCalls: [],
      } as Awaited<ReturnType<typeof generateText>>);

      const result = await runModel({
        modelId: 'fast',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(result.content).toBe('Hello');
      expect(result.usage.promptTokens).toBe(10);
      expect(result.usage.completionTokens).toBe(5);
      expect(result.usage.totalTokens).toBe(15);
      expect(result.usage.costUsd).toBe(0.001);
      expect(result.toolCalls).toEqual([]);
    });

    it('maps toolCalls from generateText result', async () => {
      vi.mocked(generateText).mockResolvedValue({
        text: '',
        usage: { inputTokens: 1, outputTokens: 0 },
        toolCalls: [
          {
            toolCallId: 'tc-1',
            toolName: 'calculator',
            input: { expression: '2+2' },
          },
        ],
      } as Awaited<ReturnType<typeof generateText>>);

      const result = await runModel({
        modelId: 'fast',
        messages: [{ role: 'user', content: 'Compute 2+2' }],
      });

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]).toEqual({
        id: 'tc-1',
        name: 'calculator',
        arguments: { expression: '2+2' },
      });
    });

    it('passes toolNames to tool lookup when provided', async () => {
      vi.mocked(generateText).mockResolvedValue({
        text: 'ok',
        usage: { inputTokens: 1, outputTokens: 1 },
        toolCalls: [],
      } as Awaited<ReturnType<typeof generateText>>);

      // Should not throw because 'calculator' is registered in the runtime
      await runModel({
        modelId: 'fast',
        messages: [{ role: 'user', content: 'x' }],
        toolNames: ['calculator'],
      });

      // Verify generateText was called with tools
      expect(generateText).toHaveBeenCalled();
    });

    it('streams text deltas to the runtime stream bus when stream=true', async () => {
      const runtime = createRuntime({
        models: { fast: fakeModel },
        tools: [],
      });
      setActiveRuntime(runtime);

      const received: string[] = [];
      const unsubscribe = await runtime.streamBus.subscribe('wf-123', (chunk) => {
        if (chunk.type === 'text-delta') received.push(chunk.payload.text);
        if (chunk.type === 'finish') received.push('[finish]');
      });

      const fullStream = (async function* () {
        yield { type: 'text-delta', textDelta: 'Hel' };
        yield { type: 'text-delta', textDelta: 'lo' };
        yield { type: 'finish', totalUsage: { inputTokens: 2, outputTokens: 2 } };
      })();

      vi.mocked(streamText).mockReturnValue({
        fullStream,
      } as any);

      const result = await runModel({
        modelId: 'fast',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: true,
        traceContext: { workflowId: 'wf-123' },
      });

      unsubscribe();

      expect(result.content).toBe('Hello');
      expect(received).toEqual(['Hel', 'lo', '[finish]']);
      expect(result.usage.promptTokens).toBe(2);
      expect(result.usage.completionTokens).toBe(2);
    });
  });

  describe('runTool', () => {
    it('validates input and calls execute', async () => {
      const result = await runTool({
        toolName: 'calculator',
        input: { expression: '6*7' },
      });

      expect(result.result).toEqual({ result: 42 });
    });

    it('throws ToolValidationError on invalid input', async () => {
      await expect(
        runTool({
          toolName: 'calculator',
          input: { wrong: 'shape' },
        }),
      ).rejects.toThrow(ToolValidationError);
    });
  });

  describe('runLifecycleHooks', () => {
    it('dispatches to hooks on the active runtime', async () => {
      const event: LifecycleEvent = {
        type: 'run:complete',
        payload: {
          kind: 'workflow',
          name: 'test',
          workflowId: 'wf-1',
          runId: 'run-1',
          input: {},
          output: {},
        },
      };
      await expect(runLifecycleHooks(event)).resolves.toBeUndefined();
    });
  });
});
