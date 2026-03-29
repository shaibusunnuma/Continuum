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
