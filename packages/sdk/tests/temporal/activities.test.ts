import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { LanguageModel } from 'ai';
import { runModel, runTool, runLifecycleHooks } from '../../src/sdk/temporal/activities';
import { ToolValidationError } from '../../src/sdk/errors';
import type { LifecycleEvent } from '../../src/sdk/hooks';

const fakeModel: LanguageModel = {
  specificationVersion: 'v2',
  provider: 'openai',
  modelId: 'gpt-4o-mini',
} as LanguageModel;

vi.mock('../../src/sdk/ai/model-registry', () => ({
  getModelInstance: vi.fn(),
  getModelOptions: vi.fn(() => ({ maxTokens: undefined })),
}));

vi.mock('../../src/sdk/ai/tool-registry', () => ({
  getToolDefinition: vi.fn(),
  getAISDKTools: vi.fn(() => ({})),
}));

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
}));

import { getModelInstance, getModelOptions } from '../../src/sdk/ai/model-registry';
import { getToolDefinition, getAISDKTools } from '../../src/sdk/ai/tool-registry';
import { generateText } from 'ai';
import { z } from 'zod';

vi.mocked(getModelInstance).mockReturnValue(fakeModel);

describe('activities', () => {
  beforeEach(() => {
    vi.mocked(generateText).mockClear();
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

    it('passes toolNames to getAISDKTools when provided', async () => {
      vi.mocked(generateText).mockResolvedValue({
        text: 'ok',
        usage: { inputTokens: 1, outputTokens: 1 },
        toolCalls: [],
      } as Awaited<ReturnType<typeof generateText>>);

      await runModel({
        modelId: 'fast',
        messages: [{ role: 'user', content: 'x' }],
        toolNames: ['calculator'],
      });

      expect(getAISDKTools).toHaveBeenCalledWith(['calculator']);
    });
  });

  describe('runTool', () => {
    it('validates input and calls execute', async () => {
      const execute = vi.fn().mockResolvedValue({ result: 42 });
      vi.mocked(getToolDefinition).mockReturnValue({
        name: 'calculator',
        description: 'Calc',
        input: z.object({ expression: z.string() }),
        output: z.object({ result: z.number() }),
        execute,
      });

      const result = await runTool({
        toolName: 'calculator',
        input: { expression: '6*7' },
      });

      expect(execute).toHaveBeenCalledWith({ expression: '6*7' });
      expect(result.result).toEqual({ result: 42 });
    });

    it('throws ToolValidationError on invalid input', async () => {
      vi.mocked(getToolDefinition).mockReturnValue({
        name: 'calculator',
        description: 'Calc',
        input: z.object({ expression: z.string() }),
        output: z.object({ result: z.number() }),
        execute: vi.fn(),
      });

      await expect(
        runTool({
          toolName: 'calculator',
          input: { wrong: 'shape' },
        }),
      ).rejects.toThrow(ToolValidationError);
    });
  });

  describe('runLifecycleHooks', () => {
    it('delegates to dispatchHooks', async () => {
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
