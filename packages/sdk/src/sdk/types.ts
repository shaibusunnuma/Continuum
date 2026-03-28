import type { ZodType } from 'zod';

// ---------------------------------------------------------------------------
// Token usage & cost
// ---------------------------------------------------------------------------

/** Token and cost data for a single model call. Returned in `ModelResult.usage` and `AgentResult.usage`. */
export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
}

// ---------------------------------------------------------------------------
// Cost Calculators
// ---------------------------------------------------------------------------

export interface CostCalculatorPayload {
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: string;
  metadata: {
    retries: number;
    latencyMs: number;
  };
}

export type CostCalculatorFn = (payload: CostCalculatorPayload) => number | Promise<number>;

export interface CostCalculator {
  calculate: CostCalculatorFn;
}


// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/**
 * A single message in a conversation. Used in `ctx.model()` messages and agent conversation history.
 * For assistant messages that include tool calls, set `toolCalls`. For tool results, set `toolCallId` and `toolName`.
 */
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolCalls?: ToolCall[];
}

// ---------------------------------------------------------------------------
// Tool calls
// ---------------------------------------------------------------------------

/** A tool call requested by the model. Used when the model returns tool calls (e.g. in the agent loop). */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** Returned by `ctx.model()`. Contains the model's text output and token/cost usage. */
export interface ModelResult {
  result: string;
  usage: Usage;
}

/** Returned by `ctx.tool()`. Generic over the tool's output type. */
export interface ToolResult<T = unknown> {
  result: T;
}

// ---------------------------------------------------------------------------
// Context object — the developer-facing API inside workflow/agent functions
// ---------------------------------------------------------------------------

/** Parameters for `ctx.model()`. Use `prompt` for a single string, or `messages` for a full conversation. */
export interface ModelCallParams {
  prompt?: string;
  messages?: Message[];
  tools?: string[];
  /** Optional registered cost calculator to execute */
  costCalculator?: string;
  /** If true, stream token deltas via the runtime stream bus (out-of-band). */
  stream?: boolean;
  responseFormat?: 'text' | 'json';
  /** Optional JSON Schema for structured output. When provided, the model call uses `generateObject()` and returns the parsed, validated object as a JSON string in `result`. Pass a plain JSON Schema object (e.g. from `zodToJsonSchema(myZodSchema)` or `z.toJSONSchema(myZodSchema)`). */
  schema?: Record<string, unknown>;
  /** Optional per-call activity timeout (e.g. '10 minutes'). Overrides the default 5 minute timeout for this specific model call. */
  timeout?: string | number;
}

/** Metadata about the current run. Read-only, available as `ctx.metadata` inside workflows. */
export interface RunMetadata {
  id: string;
  workflowName: string;
  startedAt: Date;
  accumulatedCost: number;
}

/** Options for ctx.run() child workflow execution. */
export interface ChildRunOptions {
  /** Override the task queue for this child (defaults to parent's queue). */
  taskQueue?: string;
  /** Explicit workflow ID for idempotency. Auto-generated if omitted. */
  workflowId?: string;
}

/**
 * The context object passed to workflow functions. Provides `input`, `model()`, `tool()`,
 * `run()`, `waitForInput()`, `log()`, and `metadata`.
 * This is the primary interface developers use inside `workflow()` and is never constructed manually.
 */
export interface WorkflowContext<TInput = unknown> {
  input: TInput;
  model(modelId: string, params: ModelCallParams): Promise<ModelResult>;
  tool<T = unknown>(toolName: string, input: unknown): Promise<ToolResult<T>>;
  /**
   * Run a child workflow or agent and await its result.
   * Uses Temporal child workflows under the hood — same task queue by default.
   */
  run<TChildInput, TChildOutput>(
    child: (input: TChildInput) => Promise<TChildOutput>,
    input: TChildInput,
    options?: ChildRunOptions,
  ): Promise<TChildOutput>;
  waitForInput<T = unknown>(description: string): Promise<T>;
  log(event: string, data?: unknown): void;
  /** Metadata about the current run (id, name, cost). Renamed from `run` to avoid collision with ctx.run(). */
  metadata: RunMetadata;
}

// ---------------------------------------------------------------------------
// Configuration — model registry, tool definitions, agents
// ---------------------------------------------------------------------------

/** Optional overrides for a registered model (e.g. maxTokens). Returned by getModelOptions(); not used in defineModels() input. */
export interface ModelOptions {
  maxTokens?: number;
}

/** Full definition of a tool for `defineTool()`. Uses Zod for input/output validation. */
export interface ToolDefinition<TInput = any, TOutput = any> {
  name: string;
  description: string;
  input: ZodType<TInput>;
  output: ZodType<TOutput>;
  execute: (input: TInput) => Promise<TOutput>;
}

/** Optional cost or token limits for an agent. Passed in `AgentConfig.budgetLimit`. */
export interface BudgetLimit {
  maxCostUsd?: number;
  maxTokens?: number;
}

/**
 * A child workflow/agent exposed as a callable tool inside an agent's loop.
 * The model sees it as a tool with the given name and description; the SDK
 * executes it as a Temporal child workflow (not an activity).
 */
export interface Delegate {
  /** Tool name the model will call. */
  name: string;
  /** Description shown to the model so it knows when to use this delegate. */
  description: string;
  /** The workflow or agent function to execute as a child workflow. */
  fn: (input: any) => Promise<any>;
}

/** Configuration for an agent passed to `agent()`. Specifies model, system prompt, tools, and limits. */
export interface AgentConfig {
  model: string;
  instructions: string;
  tools: string[];
  /** Optional registered cost calculator to execute */
  costCalculator?: string;
  maxSteps?: number;
  budgetLimit?: BudgetLimit;
  /** Temporal activity timeout for all model and tool calls in this agent (e.g. '10 minutes'). Defaults to '5 minutes'. */
  activityTimeout?: string | number;
  /** Child workflows/agents callable as tools. Executed as Temporal child workflows, not activities. */
  delegates?: Delegate[];
}

// ---------------------------------------------------------------------------
// Agent result
// ---------------------------------------------------------------------------

/** Returned when an agent workflow completes. Contains the final reply, step count, and total usage. */
export interface AgentResult {
  reply: string;
  finishReason: 'complete' | 'max_steps' | 'budget_exceeded';
  steps: number;
  usage: Usage;
}

// ---------------------------------------------------------------------------
// Streaming (query-based progressive state)
// ---------------------------------------------------------------------------

/** Queryable state for progressive UX. Exposed via Temporal `streamState` query on workflows, agents, and graphs. */
export interface StreamState {
  /** Current phase of the workflow/agent. */
  status: 'running' | 'waiting_for_input' | 'completed' | 'error';
  /** For agents: current step number in the tool loop. */
  currentStep?: number;
  /** The latest assistant reply (partial for agents mid-loop, final when complete). */
  partialReply?: string;
  /** Full conversation history so far (for agents). */
  messages?: Message[];
  /** Timestamp of the last state update. */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Internal activity params — not exposed to developers
// ---------------------------------------------------------------------------

/** JSON Schema for a tool's input. Used when passing tool info across the Temporal activity boundary. */
export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Optional trace context passed from workflow/agent for observability. */
export interface TraceContext {
  workflowId?: string;
  runId?: string;
  workflowName?: string;
  agentName?: string;
}

/** Input to the `runModel` Temporal activity. */
export interface RunModelParams {
  modelId: string;
  messages: Message[];
  toolNames?: string[];
  /** Optional registered cost calculator to execute */
  costCalculator?: string;
  responseFormat?: 'text' | 'json';
  /** If true, stream token deltas via the runtime stream bus (out-of-band). */
  stream?: boolean;
  /** JSON Schema for structured output. When present, runModel uses generateObject() instead of generateText(). Serialized from a Zod schema at the workflow boundary. */
  outputSchema?: Record<string, unknown>;
  /** Extra tool definitions not in the registry (e.g. delegate descriptions). The model sees these but execution is handled by the caller. */
  extraTools?: Array<{ name: string; description: string }>;
  /** Optional; set by SDK workflow/agent adapters for span attributes. */
  traceContext?: TraceContext;
}

/** Output from the `runModel` Temporal activity. */
export interface RunModelResult {
  content: string;
  toolCalls: ToolCall[];
  usage: Usage;
  /** When structured output was requested (outputSchema), contains the parsed object as a JSON string. */
  parsedObject?: string;
}

/** Input to the `runTool` Temporal activity. */
export interface RunToolParams {
  toolName: string;
  input: unknown;
  /** Optional; set by SDK workflow/agent adapters for span attributes. */
  traceContext?: TraceContext;
}

/** Output from the `runTool` Temporal activity. */
export interface RunToolResult {
  result: unknown;
}
