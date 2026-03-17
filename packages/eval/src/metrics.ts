import type { EvalExample } from './types';

// ---------------------------------------------------------------------------
// Metric types — plugin interface
// ---------------------------------------------------------------------------

export type MetricContext = {
  input: unknown;
  output: unknown;
  context?: unknown;
  /** Run metadata (latency, cost, etc.) available for threshold metrics. */
  metadata?: Record<string, unknown>;
};

export type MetricResult = {
  score: number;
  label?: string;
  details?: unknown;
};

export type MetricOptions = Record<string, unknown>;

/**
 * A metric plugin defines how to score an evaluation example.
 * - `implKind`: how it's computed (rule, llm_judge, embedding)
 * - `outputKind`: what it returns (numeric, boolean, categorical)
 */
export interface MetricImpl {
  /** Human-readable name. */
  name: string;
  /** How the metric is computed. */
  implKind: 'rule' | 'llm_judge' | 'embedding';
  /** What kind of score it produces. */
  outputKind: 'numeric' | 'boolean' | 'categorical';
  /** Short description for docs/reports. */
  description: string;
  /** Run the metric against an example's input/output. */
  run: (ctx: MetricContext, options?: MetricOptions) => Promise<MetricResult>;
}

// ---------------------------------------------------------------------------
// Built-in metrics registry
// ---------------------------------------------------------------------------

export const metrics: Record<string, MetricImpl> = {};

/**
 * Register a custom metric. Built-in metrics are registered at import time.
 * Users can call this to add their own metrics.
 */
export function defineMetric(metric: MetricImpl): void {
  if (!metric.name || typeof metric.name !== 'string' || metric.name.trim() === '') {
    throw new Error('Metric name must be a non-empty string.');
  }
  if (typeof metric.run !== 'function') {
    throw new Error(`Metric "${metric.name}" must have a run function.`);
  }
  metrics[metric.name] = metric;
}

// ---------------------------------------------------------------------------
// Built-in: exact_match
// ---------------------------------------------------------------------------

defineMetric({
  name: 'exact_match',
  implKind: 'rule',
  outputKind: 'boolean',
  description: 'Scores 1 if output.reply === input.expected, else 0.',
  async run(ctx: MetricContext): Promise<MetricResult> {
    const input = ctx.input as { expected?: unknown };
    const output = ctx.output as { reply?: unknown };
    if (input && 'expected' in input && output && 'reply' in output) {
      const ok = input.expected === output.reply;
      return { score: ok ? 1 : 0, label: ok ? 'match' : 'mismatch' };
    }
    return { score: 0, label: 'unknown' };
  },
});

// ---------------------------------------------------------------------------
// Built-in: contains_keywords
// ---------------------------------------------------------------------------

defineMetric({
  name: 'contains_keywords',
  implKind: 'rule',
  outputKind: 'boolean',
  description: 'Scores 1 if output contains all required keywords (case-insensitive). Pass keywords in options.keywords.',
  async run(ctx: MetricContext, options?: MetricOptions): Promise<MetricResult> {
    const keywords = (options?.keywords ?? (ctx.input as { keywords?: string[] })?.keywords ?? []) as string[];
    if (!keywords.length) {
      return { score: 0, label: 'no_keywords', details: 'No keywords to check.' };
    }
    const outputStr = typeof ctx.output === 'string' ? ctx.output : JSON.stringify(ctx.output);
    const lower = outputStr.toLowerCase();
    const missing = keywords.filter(k => !lower.includes(k.toLowerCase()));
    const ok = missing.length === 0;
    return {
      score: ok ? 1 : 0,
      label: ok ? 'pass' : 'fail',
      details: ok ? undefined : { missing },
    };
  },
});

// ---------------------------------------------------------------------------
// Built-in: response_length
// ---------------------------------------------------------------------------

defineMetric({
  name: 'response_length',
  implKind: 'rule',
  outputKind: 'boolean',
  description: 'Scores 1 if output length is within [min, max] chars. Pass options.min and/or options.max.',
  async run(ctx: MetricContext, options?: MetricOptions): Promise<MetricResult> {
    const outputStr = typeof ctx.output === 'string' ? ctx.output : JSON.stringify(ctx.output);
    const len = outputStr.length;
    const min = typeof options?.min === 'number' ? options.min : 0;
    const max = typeof options?.max === 'number' ? options.max : Infinity;
    const ok = len >= min && len <= max;
    return {
      score: ok ? 1 : 0,
      label: ok ? 'pass' : 'fail',
      details: { length: len, min, max },
    };
  },
});

// ---------------------------------------------------------------------------
// Built-in: json_valid
// ---------------------------------------------------------------------------

defineMetric({
  name: 'json_valid',
  implKind: 'rule',
  outputKind: 'boolean',
  description: 'Scores 1 if output is valid, parseable JSON.',
  async run(ctx: MetricContext): Promise<MetricResult> {
    // If output is already an object/array, it's valid structured data
    if (typeof ctx.output === 'object' && ctx.output !== null) {
      return { score: 1, label: 'valid' };
    }
    // If it's a string, try to parse it as JSON
    if (typeof ctx.output === 'string') {
      try {
        JSON.parse(ctx.output);
        return { score: 1, label: 'valid' };
      } catch {
        return { score: 0, label: 'invalid' };
      }
    }
    return { score: 0, label: 'invalid' };
  },
});

// ---------------------------------------------------------------------------
// Built-in: latency_threshold
// ---------------------------------------------------------------------------

defineMetric({
  name: 'latency_threshold',
  implKind: 'rule',
  outputKind: 'boolean',
  description: 'Scores 1 if run latency (from metadata.latencyMs) is below options.maxMs.',
  async run(ctx: MetricContext, options?: MetricOptions): Promise<MetricResult> {
    const latencyMs = typeof ctx.metadata?.latencyMs === 'number'
      ? ctx.metadata.latencyMs
      : undefined;
    if (latencyMs === undefined) {
      return { score: 0, label: 'no_data', details: 'metadata.latencyMs not available.' };
    }
    const maxMs = typeof options?.maxMs === 'number' ? options.maxMs : 5000;
    const ok = latencyMs <= maxMs;
    return {
      score: ok ? 1 : 0,
      label: ok ? 'pass' : 'fail',
      details: { latencyMs, maxMs },
    };
  },
});

// ---------------------------------------------------------------------------
// Built-in: cost_threshold
// ---------------------------------------------------------------------------

defineMetric({
  name: 'cost_threshold',
  implKind: 'rule',
  outputKind: 'boolean',
  description: 'Scores 1 if run cost (from metadata.costUsd) is below options.maxCostUsd.',
  async run(ctx: MetricContext, options?: MetricOptions): Promise<MetricResult> {
    const costUsd = typeof ctx.metadata?.costUsd === 'number'
      ? ctx.metadata.costUsd
      : undefined;
    if (costUsd === undefined) {
      return { score: 0, label: 'no_data', details: 'metadata.costUsd not available.' };
    }
    const maxCostUsd = typeof options?.maxCostUsd === 'number' ? options.maxCostUsd : 0.10;
    const ok = costUsd <= maxCostUsd;
    return {
      score: ok ? 1 : 0,
      label: ok ? 'pass' : 'fail',
      details: { costUsd, maxCostUsd },
    };
  },
});

// ---------------------------------------------------------------------------
// Built-in: llm_helpfulness (scaffold — requires model callable)
// ---------------------------------------------------------------------------

defineMetric({
  name: 'llm_helpfulness',
  implKind: 'llm_judge',
  outputKind: 'numeric',
  description: 'LLM-as-judge: rates response helpfulness on a 1-5 scale. Requires options.judge (async fn that takes a prompt and returns text).',
  async run(ctx: MetricContext, options?: MetricOptions): Promise<MetricResult> {
    const judge = options?.judge as ((prompt: string) => Promise<string>) | undefined;
    if (!judge) {
      return {
        score: 0,
        label: 'no_judge',
        details: 'Pass options.judge — an async function that takes a prompt string and returns the LLM response.',
      };
    }
    const prompt = `You are an expert evaluator. Rate the helpfulness of the following response on a scale of 1 to 5, where 1 is completely unhelpful and 5 is extremely helpful. Respond with ONLY a JSON object like {"score": 3, "rationale": "..."}.

User input: ${JSON.stringify(ctx.input)}
Assistant response: ${JSON.stringify(ctx.output)}`;

    try {
      const raw = await judge(prompt);
      const parsed = JSON.parse(raw);
      const score = typeof parsed.score === 'number' ? Math.min(5, Math.max(1, parsed.score)) : 3;
      return {
        score: score / 5, // Normalize to 0-1
        label: score >= 4 ? 'helpful' : score >= 2 ? 'moderate' : 'unhelpful',
        details: { rawScore: score, rationale: parsed.rationale },
      };
    } catch (err) {
      return {
        score: 0,
        label: 'error',
        details: { error: (err as Error).message },
      };
    }
  },
});

// ---------------------------------------------------------------------------
// Helper: build metric context from an eval example
// ---------------------------------------------------------------------------

export function buildMetricContext(example: EvalExample, metadata?: Record<string, unknown>): MetricContext {
  return {
    input: example.input,
    output: example.output ?? {},
    context: example.context,
    metadata,
  };
}
