/**
 * Build Temporal visibility query strings for Studio /v0/studio/runs filters.
 * Extracted from studio-server for use in the CLI built-in gateway.
 */

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
  composition?: StudioRunsCompositionFilter;
  parentWorkflowId?: string;
  parentRunId?: string;
}): string | undefined {
  const parts: string[] = [];

  const statusRaw = params.executionStatus?.trim();
  if (statusRaw) {
    const mapped = EXECUTION_STATUS_FOR_VISIBILITY[statusRaw.toUpperCase()] ?? statusRaw;
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

export function mergeStudioRunsVisibilityQuery(
  structured: string | undefined,
  rawQuery: string | undefined,
): string | undefined {
  const s = structured?.trim();
  const r = rawQuery?.trim();
  if (s && r) return `(${s}) AND (${r})`;
  return s || r || undefined;
}
