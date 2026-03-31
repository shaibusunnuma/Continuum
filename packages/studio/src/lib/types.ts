/** Durion primitive from workflow memo (when set by SDK). */
export type StudioRunPrimitive = 'graph' | 'agent' | 'workflow';

/** Gateway `GET /v0/studio/runs` row. */
export interface StudioRunRow {
  workflowId: string;
  runId: string;
  workflowType: string;
  status: string;
  taskQueue: string;
  startTime: string | null;
  closeTime: string | null;
  primitive: StudioRunPrimitive | null;
  totalTokens: number | null;
  costUsd: number | null;
  /** Temporal child workflow parent; null for root runs. */
  parentWorkflowId: string | null;
  parentRunId: string | null;
  rootWorkflowId: string | null;
  rootRunId: string | null;
}

export interface StreamState {
  status: 'running' | 'waiting_for_input' | 'completed' | 'error';
  currentStep?: number;
  partialReply?: string;
  messages?: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    toolCallId?: string;
    toolName?: string;
    toolCalls?: unknown[];
  }>;
  updatedAt: string;
}

export interface GraphStreamStateEdge {
  from: string;
  to: string | string[];
  type: 'static' | 'conditional';
  label?: string;
}

export interface GraphStreamState extends StreamState {
  topology?: {
    nodes: string[];
    edges: GraphStreamStateEdge[];
  };
  activeNodes?: string[];
  completedNodes?: string[];
  iteration?: number;
}

export interface ActivityStep {
  eventId: string;
  activityName: string;
  activityId?: string;
  input?: any;
  result?: any;
}

/** One child workflow invocation from parent history (`ctx.run` / `executeChild`). */
export interface ChildWorkflowStep {
  /** Initiated event id (correlates with `childWorkflowSpans[].key`). */
  initiatedEventId: string;
  workflowType: string;
  workflowId: string;
  runId?: string;
  input?: unknown;
  result?: unknown;
  outcome:
    | 'pending'
    | 'running'
    | 'completed'
    | 'failed'
    | 'canceled'
    | 'timed_out'
    | 'terminated'
    | 'start_failed';
  failure?: unknown;
}

// ─── Rich history types (parsed from Temporal event history JSON) ──────────

export interface HistoryEvent {
  eventId: string;
  eventType: string;
  eventTime?: string;
  /** Display-friendly label derived from event type + attributes. */
  label: string;
  /** Relevant attributes payload (varies by event type). */
  details?: Record<string, unknown>;
}

/** One activity execution interval for Gantt-style timelines (from history events). */
export interface ActivitySpan {
  /** Stable key (scheduled event id). */
  key: string;
  activityName: string;
  scheduledAt: number;
  startedAt?: number;
  endedAt?: number;
  outcome: 'scheduled' | 'running' | 'completed' | 'failed' | 'timed_out' | 'canceled';
}

export interface ParsedHistory {
  events: HistoryEvent[];
  /** Workflow input (from WorkflowExecutionStarted). */
  input: unknown | null;
  /** Workflow result (from WorkflowExecutionCompleted). */
  result: unknown | null;
  /** Memo from WorkflowExecutionStarted or WorkflowPropertiesModified. */
  memo: Record<string, unknown>;
  /** Workflow type name. */
  workflowType: string | null;
  /** Task queue. */
  taskQueue: string | null;
  /** Activity steps (scheduled + completed pairs). */
  activitySteps: ActivityStep[];
  /** For graph workflows: executed nodes extracted from the result. */
  executedNodes: string[] | null;
  /** Graph topology extracted from memo (durion:topology). */
  topology: { nodes: string[]; edges: GraphStreamStateEdge[] } | null;
  /** Activity intervals derived from scheduled/started/completed events. */
  activitySpans: ActivitySpan[];
  /** Child workflow invocations (Temporal child execution lifecycle). */
  childWorkflowSteps: ChildWorkflowStep[];
  /** Gantt rows for child workflows (`key` = initiated event id). */
  childWorkflowSpans: ActivitySpan[];
  /** Workflow execution window (ms) from first/last history timestamps. */
  historyStartMs: number | null;
  historyEndMs: number | null;
}
