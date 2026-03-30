/**
 * DTOs for Durion Studio / Gateway list + history APIs.
 * Kept separate from workflow runtime types for stable JSON shapes.
 */

/** Durion primitive when present on workflow memo (Run Explorer filters). */
export type StudioRunPrimitive = 'graph' | 'agent' | 'workflow';

/** One row in the Run Explorer (from Temporal visibility). */
export interface StudioWorkflowExecutionSummary {
  workflowId: string;
  runId: string;
  workflowType: string;
  status: string;
  startTime: string | null;
  closeTime: string | null;
  taskQueue: string;
  /** From memo when SDK wrote `durion:primitive` or inferred from `durion:topology`. */
  primitive: StudioRunPrimitive | null;
  /** From memo `durion:usage` when workflow completed (SDK). */
  totalTokens: number | null;
  costUsd: number | null;
}

export interface ListWorkflowExecutionsParams {
  /** Visibility query (Temporal SQL-like). Empty string lists recent executions (server-dependent). */
  query?: string;
  /** Max executions to return this page (capped at 100). */
  pageSize?: number;
  /** Opaque token from the previous response for pagination (base64url). */
  nextPageToken?: string;
}

export interface ListWorkflowExecutionsResult {
  executions: StudioWorkflowExecutionSummary[];
  /** Present when more pages exist. */
  nextPageToken?: string;
}
