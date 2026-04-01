/**
 * Build Temporal visibility `query` strings for GET /v0/studio/runs structured filters.
 * @see https://docs.temporal.io/visibility
 */

/** Map SDK / API status (often ALL CAPS) to Temporal filter literals. */
const EXECUTION_STATUS_FOR_VISIBILITY: Record<string, string> = {
  RUNNING: 'Running',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  CANCELED: 'Canceled',
  CANCELLED: 'Canceled',
  TERMINATED: 'Terminated',
  TIMED_OUT: 'TimedOut',
  CONTINUED_AS_NEW: 'ContinuedAsNew',
  PAUSED: 'Paused',
  UNSPECIFIED: 'Unspecified',
};

function quoteVisibilityString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export type StudioRunsCompositionFilter = 'all' | 'roots' | 'children';

export function buildStudioRunsStructuredQuery(params: {
  executionStatus?: string;
  workflowType?: string;
  workflowId?: string;
  startAfter?: string;
  startBefore?: string;
  /** Temporal visibility: ParentWorkflowId (server ≥ ~1.23 with default search attributes). */
  composition?: StudioRunsCompositionFilter;
  /** List runs whose parent workflow id matches (child workflows only). */
  parentWorkflowId?: string;
  /** When set with parentWorkflowId, narrows to children of that parent execution (Temporal ParentRunId SA). */
  parentRunId?: string;
}): string | undefined {
  const parts: string[] = [];

  const statusRaw = params.executionStatus?.trim();
  if (statusRaw) {
    const mapped =
      EXECUTION_STATUS_FOR_VISIBILITY[statusRaw.toUpperCase()] ?? statusRaw;
    parts.push(`ExecutionStatus = ${quoteVisibilityString(mapped)}`);
  }

  const wfType = params.workflowType?.trim();
  if (wfType) {
    parts.push(`WorkflowType = ${quoteVisibilityString(wfType)}`);
  }

  const wfId = params.workflowId?.trim();
  if (wfId) {
    parts.push(`WorkflowId = ${quoteVisibilityString(wfId)}`);
  }

  const parentForChildren = params.parentWorkflowId?.trim();
  if (parentForChildren) {
    parts.push(`ParentWorkflowId = ${quoteVisibilityString(parentForChildren)}`);
    const parentRun = params.parentRunId?.trim();
    if (parentRun) {
      parts.push(`ParentRunId = ${quoteVisibilityString(parentRun)}`);
    }
  } else if (params.composition === 'roots') {
    parts.push('ParentWorkflowId IS NULL');
  } else if (params.composition === 'children') {
    parts.push('ParentWorkflowId IS NOT NULL');
  }

  const after = params.startAfter?.trim();
  if (after) {
    const d = new Date(after);
    if (!Number.isNaN(d.getTime())) {
      parts.push(`StartTime >= ${quoteVisibilityString(d.toISOString())}`);
    }
  }

  const before = params.startBefore?.trim();
  if (before) {
    const d = new Date(before);
    if (!Number.isNaN(d.getTime())) {
      parts.push(`StartTime <= ${quoteVisibilityString(d.toISOString())}`);
    }
  }

  if (parts.length === 0) return undefined;
  return parts.join(' AND ');
}

/** AND structured filters with an optional raw visibility query from the client. */
export function mergeStudioRunsVisibilityQuery(
  structured: string | undefined,
  rawQuery: string | undefined,
): string | undefined {
  const s = structured?.trim();
  const r = rawQuery?.trim();
  if (s && r) return `(${s}) AND (${r})`;
  return s || r || undefined;
}
