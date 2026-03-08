export interface EchoInput {
  message: string;
}

export interface EchoOutput {
  echoed: string;
}

export interface StartWorkflowRequest {
  workflowType: string;
  input: unknown;
}

export interface StartWorkflowResponse {
  workflowId: string;
  runId: string;
}
