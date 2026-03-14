export type EvalVariant = {
  id: string;
  name: string;
  model?: string | null;
  provider?: string | null;
  promptVersion?: string | null;
  config?: unknown;
};

export type EvalRunKind = 'workflow' | 'agent';

export type EvalRun = {
  id: string;
  workflowId?: string | null;
  runId?: string | null;
  kind: EvalRunKind;
  name: string;
  variantId?: string | null;
  completedAt?: Date | null;
  metadata?: unknown;
};

export type EvalExample = {
  id: string;
  runId: string;
  input: unknown;
  output?: unknown;
  context?: unknown;
};

export type EvalCaptureParams = {
  kind: EvalRunKind;
  name: string;
  workflowId?: string;
  runId?: string;
  variantName?: string;
  modelId?: string;
  provider?: string;
  input: unknown;
  output: unknown;
  metadata?: Record<string, unknown>;
};

