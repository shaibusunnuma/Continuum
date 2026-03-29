/**
 * DTOs for Durion Studio / Gateway list + history APIs.
 * Kept separate from workflow runtime types for stable JSON shapes.
 */

/** One row in the Run Explorer (from Temporal visibility). */
export interface StudioWorkflowExecutionSummary {
  workflowId: string;
  runId: string;
  workflowType: string;
  status: string;
  startTime: string | null;
  closeTime: string | null;
  taskQueue: string;
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
