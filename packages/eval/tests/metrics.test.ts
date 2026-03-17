import { describe, it, expect, beforeEach } from 'vitest';
import {
  metrics,
  defineMetric,
  buildMetricContext,
} from '../src/metrics';
import type { MetricImpl, MetricContext, MetricResult, EvalExample } from '../src';

describe('metrics', () => {
  describe('built-in metrics registry', () => {
    it('has all 7 built-in metrics', () => {
      const names = Object.keys(metrics);
      expect(names).toContain('exact_match');
      expect(names).toContain('contains_keywords');
      expect(names).toContain('response_length');
      expect(names).toContain('json_valid');
      expect(names).toContain('latency_threshold');
      expect(names).toContain('cost_threshold');
      expect(names).toContain('llm_helpfulness');
      expect(names.length).toBeGreaterThanOrEqual(7);
    });
  });

  describe('exact_match', () => {
    const metric = metrics.exact_match;

    it('scores 1 when output.reply matches input.expected', async () => {
      const result = await metric.run({ input: { expected: 'hello' }, output: { reply: 'hello' } });
      expect(result.score).toBe(1);
      expect(result.label).toBe('match');
    });

    it('scores 0 when output.reply differs from input.expected', async () => {
      const result = await metric.run({ input: { expected: 'hello' }, output: { reply: 'world' } });
      expect(result.score).toBe(0);
      expect(result.label).toBe('mismatch');
    });

    it('scores 0 when expected or reply is missing', async () => {
      const result = await metric.run({ input: {}, output: {} });
      expect(result.score).toBe(0);
      expect(result.label).toBe('unknown');
    });
  });

  describe('contains_keywords', () => {
    const metric = metrics.contains_keywords;

    it('scores 1 when all keywords are present (case-insensitive)', async () => {
      const result = await metric.run(
        { input: {}, output: 'Hello World, this is a Test' },
        { keywords: ['hello', 'test'] },
      );
      expect(result.score).toBe(1);
      expect(result.label).toBe('pass');
    });

    it('scores 0 when some keywords are missing', async () => {
      const result = await metric.run(
        { input: {}, output: 'Hello World' },
        { keywords: ['hello', 'missing'] },
      );
      expect(result.score).toBe(0);
      expect(result.label).toBe('fail');
      expect((result.details as { missing: string[] }).missing).toContain('missing');
    });

    it('scores 0 with no_keywords label when no keywords provided', async () => {
      const result = await metric.run({ input: {}, output: 'anything' });
      expect(result.score).toBe(0);
      expect(result.label).toBe('no_keywords');
    });
  });

  describe('response_length', () => {
    const metric = metrics.response_length;

    it('scores 1 when length is within bounds', async () => {
      const result = await metric.run(
        { input: {}, output: 'hello world' },
        { min: 5, max: 50 },
      );
      expect(result.score).toBe(1);
    });

    it('scores 0 when length is below min', async () => {
      const result = await metric.run(
        { input: {}, output: 'hi' },
        { min: 10, max: 50 },
      );
      expect(result.score).toBe(0);
      expect(result.label).toBe('fail');
    });

    it('scores 0 when length is above max', async () => {
      const result = await metric.run(
        { input: {}, output: 'hello world this is a very long string' },
        { max: 10 },
      );
      expect(result.score).toBe(0);
    });
  });

  describe('json_valid', () => {
    const metric = metrics.json_valid;

    it('scores 1 for valid JSON string', async () => {
      const result = await metric.run({ input: {}, output: '{"key": "value"}' });
      expect(result.score).toBe(1);
      expect(result.label).toBe('valid');
    });

    it('scores 0 for invalid JSON string', async () => {
      const result = await metric.run({ input: {}, output: 'not json {{{' });
      expect(result.score).toBe(0);
      expect(result.label).toBe('invalid');
    });

    it('scores 1 for objects (they serialize to valid JSON)', async () => {
      const result = await metric.run({ input: {}, output: { key: 'value' } });
      expect(result.score).toBe(1);
    });
  });

  describe('latency_threshold', () => {
    const metric = metrics.latency_threshold;

    it('scores 1 when latency is below threshold', async () => {
      const result = await metric.run(
        { input: {}, output: {}, metadata: { latencyMs: 1000 } },
        { maxMs: 5000 },
      );
      expect(result.score).toBe(1);
      expect(result.label).toBe('pass');
    });

    it('scores 0 when latency exceeds threshold', async () => {
      const result = await metric.run(
        { input: {}, output: {}, metadata: { latencyMs: 10000 } },
        { maxMs: 5000 },
      );
      expect(result.score).toBe(0);
      expect(result.label).toBe('fail');
    });

    it('scores 0 with no_data when metadata is missing', async () => {
      const result = await metric.run({ input: {}, output: {} });
      expect(result.score).toBe(0);
      expect(result.label).toBe('no_data');
    });
  });

  describe('cost_threshold', () => {
    const metric = metrics.cost_threshold;

    it('scores 1 when cost is below threshold', async () => {
      const result = await metric.run(
        { input: {}, output: {}, metadata: { costUsd: 0.05 } },
        { maxCostUsd: 0.10 },
      );
      expect(result.score).toBe(1);
    });

    it('scores 0 when cost exceeds threshold', async () => {
      const result = await metric.run(
        { input: {}, output: {}, metadata: { costUsd: 0.50 } },
        { maxCostUsd: 0.10 },
      );
      expect(result.score).toBe(0);
    });

    it('scores 0 with no_data when metadata is missing', async () => {
      const result = await metric.run({ input: {}, output: {} });
      expect(result.score).toBe(0);
      expect(result.label).toBe('no_data');
    });
  });

  describe('llm_helpfulness', () => {
    const metric = metrics.llm_helpfulness;

    it('scores 0 with no_judge when judge function not provided', async () => {
      const result = await metric.run({ input: {}, output: {} });
      expect(result.score).toBe(0);
      expect(result.label).toBe('no_judge');
    });

    it('uses judge function and normalizes score to 0-1', async () => {
      const judge = async (_prompt: string) => JSON.stringify({ score: 4, rationale: 'Very helpful' });
      const result = await metric.run(
        { input: 'question', output: 'good answer' },
        { judge },
      );
      expect(result.score).toBe(4 / 5);
      expect(result.label).toBe('helpful');
    });

    it('handles judge errors gracefully', async () => {
      const judge = async () => { throw new Error('LLM failed'); };
      const result = await metric.run(
        { input: 'q', output: 'a' },
        { judge },
      );
      expect(result.score).toBe(0);
      expect(result.label).toBe('error');
    });
  });

  describe('defineMetric', () => {
    it('registers a custom metric', async () => {
      defineMetric({
        name: 'custom_test',
        implKind: 'rule',
        outputKind: 'boolean',
        description: 'A test metric',
        run: async () => ({ score: 1, label: 'pass' }),
      });
      expect(metrics.custom_test).toBeDefined();
      const result = await metrics.custom_test.run({ input: {}, output: {} });
      expect(result.score).toBe(1);
    });

    it('rejects empty name', () => {
      expect(() => defineMetric({
        name: '',
        implKind: 'rule',
        outputKind: 'boolean',
        description: 'Bad',
        run: async () => ({ score: 0 }),
      })).toThrow('non-empty string');
    });

    it('rejects missing run function', () => {
      expect(() => defineMetric({
        name: 'bad_metric',
        implKind: 'rule',
        outputKind: 'boolean',
        description: 'Bad',
        run: null as any,
      })).toThrow('run function');
    });
  });

  describe('buildMetricContext', () => {
    it('builds context from an eval example', () => {
      const example = {
        id: '1',
        runId: 'run-1',
        input: { question: 'hi' },
        output: { reply: 'hello' },
        context: { docs: ['doc1'] },
      };
      const ctx = buildMetricContext(example as unknown as EvalExample);
      expect(ctx.input).toEqual({ question: 'hi' });
      expect(ctx.output).toEqual({ reply: 'hello' });
      expect(ctx.context).toEqual({ docs: ['doc1'] });
    });

    it('includes metadata when provided', () => {
      const example = {
        id: '1',
        runId: 'run-1',
        input: {},
        output: {},
      };
      const ctx = buildMetricContext(example as unknown as EvalExample, { latencyMs: 500 });
      expect(ctx.metadata).toEqual({ latencyMs: 500 });
    });
  });
});
