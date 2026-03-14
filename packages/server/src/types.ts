export interface StartWorkflowRequest {
  workflowType: string;
  input: unknown;
}

export interface StartWorkflowResponse {
  workflowId: string;
  runId: string;
}
