# Part 1: Types and Interfaces

## Quick reference

| Type | Description |
|------|-------------|
| `Usage` | Token and cost data for a single model call (promptTokens, completionTokens, totalTokens, costUsd). |
| `Message` | A conversation message (role, content; optional toolCallId, toolName, toolCalls for tool/assistant). |
| `ToolCall` | A tool call from the model (id, name, arguments). |
| `ModelResult` | Returned by `ctx.model()`: result (string) and usage. |
| `ToolResult<T>` | Returned by `ctx.tool()`: result of type T. |
| `ModelCallParams` | Params for `ctx.model()`: prompt, messages, tools, responseFormat. |
| `RunMetadata` | Read-only run info: id, workflowName, startedAt, accumulatedCost (ctx.run). |
| `WorkflowContext<TInput>` | The ctx object: input, model(), tool(), waitForInput(), log(), run. |
| `ModelConfig` | Per-model config for defineModels: provider, model, temperature?, maxTokens?. |
| `ToolDefinition<TInput, TOutput>` | Per-tool config for defineTool: name, description, input/output Zod, execute. |
| `BudgetLimit` | Optional limits: maxCostUsd?, maxTokens?. |
| `AgentConfig` | Config for agent(): model, instructions, tools, maxSteps?, budgetLimit?. |
| `AgentResult` | Agent workflow result: reply, finishReason, steps, usage. |
| `ToolSchema` | (Internal) JSON Schema for a tool’s input. |
| `RunModelParams` / `RunModelResult` | (Internal) runModel activity in/out. |
| `RunToolParams` / `RunToolResult` | (Internal) runTool activity in/out. |

## Purpose

This module defines every type the SDK uses. All other components import from here. Developers see a subset of these types as the public API; the rest are internal.

## Public types (exported to developers)

### ModelResult

Returned by `ctx.model()`. Contains the model output and usage/cost data.

```ts
interface ModelResult {
  result: string;
  usage: Usage;
}
```

### Usage

Token and cost data for a single model call.

```ts
interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
}
```

### ToolResult

Returned by `ctx.tool()`. Generic over the output type.

```ts
interface ToolResult<T = unknown> {
  result: T;
}
```

### Message

Conversation message format, used in `ctx.model()` messages param and agent conversation history.

```ts
interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
}
```

### ToolCall

Represents a tool call requested by a model (used internally in the agent loop).

```ts
interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
```

### WorkflowContext

The `ctx` object passed to workflow functions. This is the developer's primary interface.

```ts
interface WorkflowContext<TInput = unknown> {
  input: TInput;
  model(modelId: string, params: ModelCallParams): Promise<ModelResult>;
  tool<T = unknown>(toolName: string, input: unknown): Promise<ToolResult<T>>;
  waitForInput<T = unknown>(description: string): Promise<T>;
  log(event: string, data?: unknown): void;
  run: RunMetadata;
}
```

### ModelCallParams

Parameters for `ctx.model()`.

```ts
interface ModelCallParams {
  prompt?: string;
  messages?: Message[];
  tools?: string[];
  responseFormat?: 'text' | 'json';
}
```

### RunMetadata

Metadata about the current run, accessible via `ctx.run`.

```ts
interface RunMetadata {
  id: string;
  workflowName: string;
  startedAt: Date;
  accumulatedCost: number;
}
```

## Config types (used by defineModels, defineTool, agent)

### ModelConfig

Configuration for a single model in the registry.

```ts
interface ModelConfig {
  provider: string;   // 'openai' | 'anthropic' | 'google' | etc.
  model: string;      // 'gpt-4o-mini' | 'claude-sonnet-4-20250514' | etc.
  temperature?: number;
  maxTokens?: number;
}
```

### ToolDefinition

Configuration for a tool registered via `defineTool()`. Uses Zod schemas for type safety.

```ts
interface ToolDefinition<TInput = any, TOutput = any> {
  name: string;
  description: string;
  input: ZodType<TInput>;
  output: ZodType<TOutput>;
  execute: (input: TInput) => Promise<TOutput>;
}
```

### AgentConfig

Configuration for an agent registered via `agent()`.

```ts
interface AgentConfig {
  model: string;                       // model id from registry
  instructions: string;                // system prompt
  tools: string[];                     // tool names from registry
  maxSteps?: number;                   // default: 10
  budgetLimit?: {
    maxCostUsd?: number;
    maxTokens?: number;
  };
}
```

### BudgetLimit

Extracted budget limit type.

```ts
interface BudgetLimit {
  maxCostUsd?: number;
  maxTokens?: number;
}
```

## Internal types (not exported to developers)

### RunModelParams / RunModelResult

Activity input/output for the `runModel` activity.

```ts
interface RunModelParams {
  modelId: string;
  messages: Message[];
  tools?: ToolSchema[];
  responseFormat?: 'text' | 'json';
}

interface RunModelResult {
  content: string;
  toolCalls: ToolCall[];
  usage: Usage;
}
```

### RunToolParams / RunToolResult

Activity input/output for the `runTool` activity.

```ts
interface RunToolParams {
  toolName: string;
  input: unknown;
}

interface RunToolResult {
  result: unknown;
}
```

### ToolSchema

JSON Schema representation of a tool, passed to AI SDK for agent tool calling.

```ts
interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;  // JSON Schema from Zod
}
```

## File

All types go in `src/sdk/types.ts`. Public types are re-exported from `src/sdk/index.ts`.
