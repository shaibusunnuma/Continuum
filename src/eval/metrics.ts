import type { EvalExample } from './types';

export type MetricContext = {
  input: unknown;
  output: unknown;
  context?: unknown;
};

export type MetricResult = {
  score: number;
  label?: string;
  details?: unknown;
};

export type MetricImpl =
  | {
      kind: 'rule';
      run: (ctx: MetricContext) => Promise<MetricResult>;
    }
  | {
      kind: 'llm_judge';
      run: (ctx: MetricContext) => Promise<MetricResult>;
    };

export const metrics: Record<string, MetricImpl> = {
  exact_match: {
    kind: 'rule',
    async run(ctx: MetricContext): Promise<MetricResult> {
      // Very simple example: if output.reply === input.expected, score 1 else 0.
      const input = ctx.input as { expected?: unknown };
      const output = ctx.output as { reply?: unknown };
      if (input && 'expected' in input && output && 'reply' in output) {
        const ok = input.expected === output.reply;
        return { score: ok ? 1 : 0, label: ok ? 'match' : 'mismatch' };
      }
      return { score: 0, label: 'unknown' };
    },
  },
};

export function buildMetricContext(example: EvalExample): MetricContext {
  return {
    input: example.input,
    output: example.output ?? {},
    context: example.context,
  };
}

