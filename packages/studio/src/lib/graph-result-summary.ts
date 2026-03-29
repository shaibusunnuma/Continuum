const GRAPH_TERMINATION_STATUSES = new Set([
  'completed',
  'max_iterations',
  'budget_exceeded',
  'error',
]);

export interface GraphResultSummary {
  graphStatus: string | null;
  totalTokens: number | null;
  executedChain: string[];
  /** Truncated finalReport text, or null if absent / non-string. */
  outputPreview: string | null;
  /** True when `output` object existed and `finalReport` key was checked. */
  hadOutputObject: boolean;
  errorLine: string | null;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export function isGraphResultPayload(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const r = result as Record<string, unknown>;
  return typeof r.status === 'string' && GRAPH_TERMINATION_STATUSES.has(r.status);
}

/**
 * Extract display fields from a graph workflow completion payload (GraphResult shape).
 */
export function parseGraphResultSummary(
  result: unknown,
  executedNodesFromHistory: string[] | null,
): GraphResultSummary {
  let graphStatus: string | null = null;
  let totalTokens: number | null = null;
  let executedChain: string[] = [...(executedNodesFromHistory ?? [])];
  let outputPreview: string | null = null;
  let hadOutputObject = false;
  let errorLine: string | null = null;

  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>;

    if (typeof r.status === 'string' && GRAPH_TERMINATION_STATUSES.has(r.status)) {
      graphStatus = r.status;
    }

    const usage = r.totalUsage;
    if (usage && typeof usage === 'object' && usage !== null) {
      const tt = (usage as Record<string, unknown>).totalTokens;
      if (typeof tt === 'number' && Number.isFinite(tt)) totalTokens = tt;
    }

    const en = r.executedNodes;
    if (Array.isArray(en) && en.every((x) => typeof x === 'string')) {
      executedChain = en as string[];
    }

    const output = r.output;
    if (output && typeof output === 'object' && output !== null) {
      hadOutputObject = true;
      const fr = (output as Record<string, unknown>).finalReport;
      if (typeof fr === 'string') outputPreview = truncate(fr, 120);
    }

    const err = r.error;
    if (err && typeof err === 'object' && err !== null) {
      const node = (err as Record<string, unknown>).node;
      const message = (err as Record<string, unknown>).message;
      if (typeof node === 'string' && typeof message === 'string') errorLine = `${node}: ${message}`;
    }
  }

  return {
    graphStatus,
    totalTokens,
    executedChain,
    outputPreview,
    hadOutputObject,
    errorLine,
  };
}
