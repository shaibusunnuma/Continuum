import type {
  ActivitySpan,
  ActivityStep,
  GraphStreamStateEdge,
  HistoryEvent,
  ParsedHistory,
} from './types';

type RawEvent = Record<string, unknown>;

function str(v: unknown): string {
  if (typeof v === 'string') return v;
  return v != null ? String(v) : '';
}

/** Uppercase `eventType` for comparisons (handles `EVENT_TYPE_*` and shorthand encodings). */
function historyEventTypeKey(raw: unknown): string {
  return str(raw).toUpperCase();
}

/** True if the history event type string contains the fragment (case-insensitive). */
function historyEventMatches(raw: unknown, fragment: string): boolean {
  return historyEventTypeKey(raw).includes(fragment.toUpperCase());
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

/** Task queue on WorkflowExecutionStarted — proto JSON uses `{ name, kind }`; some exports use a plain string. */
function taskQueueFromStartedAttributes(attrs: RawEvent): string | null {
  const tq = attrs.taskQueue;
  if (typeof tq === 'string' && tq.trim()) return tq.trim();
  if (tq && typeof tq === 'object') {
    const name = (tq as RawEvent).name;
    if (typeof name === 'string' && name.trim()) return name.trim();
  }
  return null;
}

/** Decode one Temporal `Payload` (JSON/protobuf JSON with base64 `data`) to a JS value. */
function decodeTemporalPayloadItem(item: unknown): unknown {
  if (item === null || typeof item !== 'object') return item;
  const o = item as RawEvent;
  if (typeof o.data !== 'string') return item;
  try {
    const json = atob(o.data);
    return JSON.parse(json) as unknown;
  } catch {
    try {
      return JSON.parse(o.data) as unknown;
    } catch {
      return item;
    }
  }
}

/** Workflow input / result `payloads` arrays — decode base64 like the Web UI / memo fields. */
function extractDecodedPayloads(payloads: unknown): unknown {
  if (!Array.isArray(payloads) || payloads.length === 0) return undefined;
  const decoded = payloads.map(decodeTemporalPayloadItem);
  if (decoded.length === 1) return decoded[0];
  return decoded;
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

function parseEventTimeMs(raw: unknown): number | null {
  if (typeof raw !== 'string' || !raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

function numAttr(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v) {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Build activity Gantt spans from raw history events (same source as Temporal Web UI timeline).
 */
function buildActivitySpansFromRawEvents(rawEvents: unknown[]): {
  spans: ActivitySpan[];
  historyStartMs: number | null;
  historyEndMs: number | null;
} {
  type Slot = {
    scheduledEventId: number;
    activityName: string;
    scheduledAt: number;
    startedAt?: number;
    endedAt?: number;
    outcome: ActivitySpan['outcome'];
  };

  const slots = new Map<number, Slot>();
  let historyStartMs: number | null = null;
  let historyEndMs: number | null = null;

  const bump = (ms: number | null) => {
    if (ms == null) return;
    historyStartMs = historyStartMs == null ? ms : Math.min(historyStartMs, ms);
    historyEndMs = historyEndMs == null ? ms : Math.max(historyEndMs, ms);
  };

  for (const ev of rawEvents) {
    if (typeof ev !== 'object' || ev === null) continue;
    const e = ev as RawEvent;
    const eventType = historyEventTypeKey(e.eventType);
    const attrs = getAttrs(e);
    const t = parseEventTimeMs(e.eventTime);
    bump(t);

    if (historyEventMatches(eventType, 'ACTIVITY_TASK_SCHEDULED') && attrs) {
      const id = numAttr(e.eventId);
      const at = (attrs.activityType as RawEvent)?.name;
      if (id != null) {
        slots.set(id, {
          scheduledEventId: id,
          activityName: str(at) || 'activity',
          scheduledAt: t ?? historyEndMs ?? 0,
          outcome: 'scheduled',
        });
      }
    }

    if (historyEventMatches(eventType, 'ACTIVITY_TASK_STARTED') && attrs) {
      const sid = numAttr(attrs.scheduledEventId);
      if (sid != null) {
        const slot = slots.get(sid);
        if (slot && t != null) {
          slot.startedAt = t;
          slot.outcome = 'running';
        }
      }
    }

    if (
      (historyEventMatches(eventType, 'ACTIVITY_TASK_COMPLETED') ||
        historyEventMatches(eventType, 'ACTIVITY_TASK_FAILED') ||
        historyEventMatches(eventType, 'ACTIVITY_TASK_TIMED_OUT') ||
        historyEventMatches(eventType, 'ACTIVITY_TASK_CANCELED')) &&
      attrs
    ) {
      const sid = numAttr(attrs.scheduledEventId);
      if (sid != null) {
        const slot = slots.get(sid);
        if (slot && t != null) {
          slot.endedAt = t;
          if (historyEventMatches(eventType, 'ACTIVITY_TASK_COMPLETED')) slot.outcome = 'completed';
          else if (historyEventMatches(eventType, 'ACTIVITY_TASK_FAILED')) slot.outcome = 'failed';
          else if (historyEventMatches(eventType, 'ACTIVITY_TASK_TIMED_OUT')) slot.outcome = 'timed_out';
          else slot.outcome = 'canceled';
        }
      }
    }
  }

  const spans: ActivitySpan[] = [...slots.values()]
    .sort((a, b) => a.scheduledEventId - b.scheduledEventId)
    .map((s) => ({
      key: String(s.scheduledEventId),
      activityName: s.activityName,
      scheduledAt: s.scheduledAt,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      outcome: s.outcome,
    }));

  return { spans, historyStartMs, historyEndMs };
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
    if (!historyEventMatches(e.eventType, 'ACTIVITY_TASK_SCHEDULED')) continue;

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
    activitySpans: [],
    historyStartMs: null,
    historyEndMs: null,
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
    const eventType = historyEventTypeKey(e.eventType);
    const attrs = getAttrs(e);

    parsed.push({
      eventId: str(e.eventId),
      eventType: str(e.eventType),
      eventTime: str(e.eventTime) || undefined,
      label: eventLabel(eventType, attrs),
      details: attrs,
    });

    if (historyEventMatches(eventType, 'WORKFLOW_EXECUTION_STARTED') && attrs) {
      workflowType = str((attrs.workflowType as RawEvent)?.name) || null;
      taskQueue = taskQueueFromStartedAttributes(attrs);
      const inp = attrs.input as RawEvent | undefined;
      input = extractDecodedPayloads(inp?.payloads) ?? null;
      memo = { ...memo, ...extractMemoFromAttrs(attrs) };
    }

    if (historyEventMatches(eventType, 'WORKFLOW_PROPERTIES_MODIFIED') && attrs) {
      memo = { ...memo, ...extractMemoFromAttrs(attrs.upsertedMemo as RawEvent | undefined ?? attrs) };
    }

    if (historyEventMatches(eventType, 'ACTIVITY_TASK_SCHEDULED') && attrs) {
      const at = (attrs.activityType as RawEvent)?.name;
      activitySteps.push({
        eventId: str(e.eventId),
        activityName: str(at) || 'activity',
      });
    }

    if (historyEventMatches(eventType, 'WORKFLOW_EXECUTION_COMPLETED') && attrs) {
      const res = attrs.result as RawEvent | undefined;
      result = extractDecodedPayloads(res?.payloads) ?? null;
    }
  }

  let executedNodes: string[] | null = null;
  if (result && typeof result === 'object' && 'executedNodes' in (result as Record<string, unknown>)) {
    const en = (result as Record<string, unknown>).executedNodes;
    if (Array.isArray(en)) executedNodes = en as string[];
  }

  const topology = parseMemoTopology(memo);
  const { spans, historyStartMs, historyEndMs } = buildActivitySpansFromRawEvents(rawEvents);

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
    activitySpans: spans,
    historyStartMs,
    historyEndMs,
  };
}
