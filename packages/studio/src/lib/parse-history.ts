import type { ActivityStep, GraphStreamStateEdge, HistoryEvent, ParsedHistory } from './types';

type RawEvent = Record<string, unknown>;

function str(v: unknown): string {
  if (typeof v === 'string') return v;
  return v != null ? String(v) : '';
}

function eventLabel(eventType: string, attrs: RawEvent | undefined): string {
  switch (eventType) {
    case 'EVENT_TYPE_WORKFLOW_EXECUTION_STARTED': {
      const wt = (attrs?.workflowType as RawEvent)?.name;
      return wt ? `WorkflowStarted (${str(wt)})` : 'WorkflowStarted';
    }
    case 'EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED':
      return 'WorkflowCompleted';
    case 'EVENT_TYPE_WORKFLOW_EXECUTION_FAILED':
      return 'WorkflowFailed';
    case 'EVENT_TYPE_WORKFLOW_EXECUTION_TIMED_OUT':
      return 'WorkflowTimedOut';
    case 'EVENT_TYPE_WORKFLOW_EXECUTION_CANCELED':
      return 'WorkflowCanceled';
    case 'EVENT_TYPE_WORKFLOW_EXECUTION_TERMINATED':
      return 'WorkflowTerminated';
    case 'EVENT_TYPE_WORKFLOW_EXECUTION_CONTINUED_AS_NEW':
      return 'ContinuedAsNew';
    case 'EVENT_TYPE_ACTIVITY_TASK_SCHEDULED': {
      const at = (attrs?.activityType as RawEvent)?.name;
      return at ? `ActivityScheduled: ${str(at)}` : 'ActivityScheduled';
    }
    case 'EVENT_TYPE_ACTIVITY_TASK_STARTED':
      return 'ActivityStarted';
    case 'EVENT_TYPE_ACTIVITY_TASK_COMPLETED':
      return 'ActivityCompleted';
    case 'EVENT_TYPE_ACTIVITY_TASK_FAILED':
      return 'ActivityFailed';
    case 'EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT':
      return 'ActivityTimedOut';
    case 'EVENT_TYPE_ACTIVITY_TASK_CANCEL_REQUESTED':
      return 'ActivityCancelRequested';
    case 'EVENT_TYPE_ACTIVITY_TASK_CANCELED':
      return 'ActivityCanceled';
    case 'EVENT_TYPE_TIMER_STARTED':
      return 'TimerStarted';
    case 'EVENT_TYPE_TIMER_FIRED':
      return 'TimerFired';
    case 'EVENT_TYPE_TIMER_CANCELED':
      return 'TimerCanceled';
    case 'EVENT_TYPE_WORKFLOW_TASK_SCHEDULED':
      return 'WorkflowTaskScheduled';
    case 'EVENT_TYPE_WORKFLOW_TASK_STARTED':
      return 'WorkflowTaskStarted';
    case 'EVENT_TYPE_WORKFLOW_TASK_COMPLETED':
      return 'WorkflowTaskCompleted';
    case 'EVENT_TYPE_WORKFLOW_TASK_FAILED':
      return 'WorkflowTaskFailed';
    case 'EVENT_TYPE_WORKFLOW_TASK_TIMED_OUT':
      return 'WorkflowTaskTimedOut';
    case 'EVENT_TYPE_MARKER_RECORDED':
      return 'MarkerRecorded';
    case 'EVENT_TYPE_SIGNAL_EXTERNAL_WORKFLOW_EXECUTION_INITIATED':
      return 'SignalInitiated';
    case 'EVENT_TYPE_WORKFLOW_EXECUTION_SIGNALED':
      return 'WorkflowSignaled';
    case 'EVENT_TYPE_WORKFLOW_PROPERTIES_MODIFIED':
      return 'PropertiesModified';
    default: {
      const short = eventType
        .replace(/^EVENT_TYPE_/, '')
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
      return short || eventType;
    }
  }
}

function getAttrs(e: RawEvent): RawEvent | undefined {
  for (const key of Object.keys(e)) {
    if (key.endsWith('EventAttributes') && typeof e[key] === 'object' && e[key] !== null) {
      return e[key] as RawEvent;
    }
  }
  return undefined;
}

function extractPayloads(payloads: unknown): unknown {
  if (!Array.isArray(payloads)) return undefined;
  if (payloads.length === 0) return undefined;
  if (payloads.length === 1) return payloads[0];
  return payloads;
}

function extractMemoFromAttrs(attrs: RawEvent | undefined): Record<string, unknown> {
  if (!attrs) return {};
  const memo = attrs.memo as RawEvent | undefined;
  if (!memo) return {};
  const fields = memo.fields as RawEvent | undefined;
  if (!fields) {
    const entries = Object.entries(memo).filter(([k]) => k !== 'fields');
    if (entries.length > 0) return Object.fromEntries(entries);
    return {};
  }
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(fields)) {
    const payload = val as RawEvent | undefined;
    if (payload?.data) {
      try {
        const decoded = typeof payload.data === 'string'
          ? JSON.parse(atob(payload.data))
          : payload.data;
        result[key] = decoded;
      } catch {
        result[key] = payload.data;
      }
    } else {
      result[key] = val;
    }
  }
  return result;
}

function parseMemoTopology(
  memo: Record<string, unknown>,
): { nodes: string[]; edges: GraphStreamStateEdge[] } | null {
  const raw = memo?.['durion:topology'];
  if (typeof raw !== 'object' || raw === null) return null;
  const t = raw as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(t.nodes) || t.nodes.length === 0) return null;
  return raw as { nodes: string[]; edges: GraphStreamStateEdge[] };
}

/**
 * Extract ActivityTaskScheduled steps from Temporal history JSON (from `historyToJSON`).
 */
export function parseActivityStepsFromHistory(history: unknown): ActivityStep[] {
  if (typeof history !== 'object' || history === null) return [];
  const events = (history as { events?: unknown }).events;
  if (!Array.isArray(events)) return [];

  const steps: ActivityStep[] = [];
  for (const ev of events) {
    if (typeof ev !== 'object' || ev === null) continue;
    const e = ev as Record<string, unknown>;
    const eventType = String(e.eventType ?? '');
    if (!eventType.includes('ACTIVITY_TASK_SCHEDULED')) continue;

    const attrs = e.activityTaskScheduledEventAttributes as Record<string, unknown> | undefined;
    const activityType = attrs?.activityType as Record<string, unknown> | undefined;
    const name = String(activityType?.name ?? 'activity');
    steps.push({
      eventId: String(e.eventId ?? ''),
      activityName: name,
    });
  }
  return steps;
}

/**
 * Parse full history JSON into a rich structured representation.
 * Extracts everything the Temporal Web UI shows plus Durion-specific fields.
 */
export function parseFullHistory(history: unknown): ParsedHistory {
  const empty: ParsedHistory = {
    events: [],
    input: null,
    result: null,
    memo: {},
    workflowType: null,
    taskQueue: null,
    activitySteps: [],
    executedNodes: null,
    topology: null,
  };

  if (typeof history !== 'object' || history === null) return empty;
  const rawEvents = (history as { events?: unknown }).events;
  if (!Array.isArray(rawEvents)) return empty;

  const parsed: HistoryEvent[] = [];
  const activitySteps: ActivityStep[] = [];
  let input: unknown = null;
  let result: unknown = null;
  let memo: Record<string, unknown> = {};
  let workflowType: string | null = null;
  let taskQueue: string | null = null;

  for (const ev of rawEvents) {
    if (typeof ev !== 'object' || ev === null) continue;
    const e = ev as RawEvent;
    const eventType = str(e.eventType);
    const attrs = getAttrs(e);

    parsed.push({
      eventId: str(e.eventId),
      eventType,
      eventTime: str(e.eventTime) || undefined,
      label: eventLabel(eventType, attrs),
      details: attrs,
    });

    if (eventType.includes('WORKFLOW_EXECUTION_STARTED') && attrs) {
      workflowType = str((attrs.workflowType as RawEvent)?.name) || null;
      taskQueue = str((attrs.taskQueue as RawEvent)?.name) || null;
      const inp = attrs.input as RawEvent | undefined;
      input = extractPayloads(inp?.payloads) ?? null;
      memo = { ...memo, ...extractMemoFromAttrs(attrs) };
    }

    if (eventType.includes('WORKFLOW_PROPERTIES_MODIFIED') && attrs) {
      memo = { ...memo, ...extractMemoFromAttrs(attrs.upsertedMemo as RawEvent | undefined ?? attrs) };
    }

    if (eventType.includes('ACTIVITY_TASK_SCHEDULED') && attrs) {
      const at = (attrs.activityType as RawEvent)?.name;
      activitySteps.push({
        eventId: str(e.eventId),
        activityName: str(at) || 'activity',
      });
    }

    if (eventType.includes('WORKFLOW_EXECUTION_COMPLETED') && attrs) {
      const res = attrs.result as RawEvent | undefined;
      result = extractPayloads(res?.payloads) ?? null;
    }
  }

  let executedNodes: string[] | null = null;
  if (result && typeof result === 'object' && 'executedNodes' in (result as Record<string, unknown>)) {
    const en = (result as Record<string, unknown>).executedNodes;
    if (Array.isArray(en)) executedNodes = en as string[];
  }

  const topology = parseMemoTopology(memo);

  return {
    events: parsed,
    input,
    result,
    memo,
    workflowType,
    taskQueue,
    activitySteps,
    executedNodes,
    topology,
  };
}
