/** Gateway `GET /v0/studio/runs` row. */
export interface StudioRunRow {
  workflowId: string;
  runId: string;
  workflowType: string;
  status: string;
  taskQueue: string;
  startTime: string | null;
  closeTime: string | null;
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
}
