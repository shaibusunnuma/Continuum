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
  responseFormat?: 'text' | 'json';
}

/** Metadata about the current run. Read-only, available as `ctx.run` inside workflows. */
export interface RunMetadata {
  id: string;
  workflowName: string;
  startedAt: Date;
  accumulatedCost: number;
}

/**
 * The context object passed to workflow functions. Provides `input`, `model()`, `tool()`, `waitForInput()`, `log()`, and `run`.
 * This is the primary interface developers use inside `workflow()` and is never constructed manually.
 */
export interface WorkflowContext<TInput = unknown> {
  input: TInput;
  model(modelId: string, params: ModelCallParams): Promise<ModelResult>;
  tool<T = unknown>(toolName: string, input: unknown): Promise<ToolResult<T>>;
  waitForInput<T = unknown>(description: string): Promise<T>;
  log(event: string, data?: unknown): void;
  run: RunMetadata;
}

// ---------------------------------------------------------------------------
// Configuration — model registry, tool definitions, agents
// ---------------------------------------------------------------------------

/** Configuration for a single model passed to `defineModels()`. Maps to a Vercel AI SDK provider + model id. */
export interface ModelConfig {
  provider: string;
  model: string;
  temperature?: number;
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

/** Configuration for an agent passed to `agent()`. Specifies model, system prompt, tools, and limits. */
export interface AgentConfig {
  model: string;
  instructions: string;
  tools: string[];
  maxSteps?: number;
  budgetLimit?: BudgetLimit;
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
// Internal activity params — not exposed to developers
// ---------------------------------------------------------------------------

/** JSON Schema for a tool's input. Used when passing tool info across the Temporal activity boundary. */
export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Input to the `runModel` Temporal activity. */
export interface RunModelParams {
  modelId: string;
  messages: Message[];
  toolNames?: string[];
  responseFormat?: 'text' | 'json';
}

/** Output from the `runModel` Temporal activity. */
export interface RunModelResult {
  content: string;
  toolCalls: ToolCall[];
  usage: Usage;
}

/** Input to the `runTool` Temporal activity. */
export interface RunToolParams {
  toolName: string;
  input: unknown;
}

/** Output from the `runTool` Temporal activity. */
export interface RunToolResult {
  result: unknown;
}
