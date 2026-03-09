# Part 3: Tool Registry

## Quick reference

| Function | Description |
|----------|-------------|
| `defineTool(def)` | Registers a single tool (name, description, Zod input/output, execute). Call at worker startup. |
| `defineTools(defs)` | Registers multiple tools at once. |
| `getToolDefinition(name)` | Returns the full ToolDefinition for a registered tool (used by runTool activity). |
| `getAISDKTools(names)` | Returns AI SDK–compatible tool objects for generateText({ tools }) (schema only; no execute). |
| `getToolSchemas(names)` | Returns JSON Schema for each tool’s input (for serialization across the activity boundary). |
| `clearToolRegistry()` | Removes all registered tools (mainly for tests). |

## Purpose

The tool registry maps tool names to their definitions (Zod schemas + execute functions). It serves two consumers:

1. **`runTool` activity** — looks up a tool by name, validates input, runs `execute()`
2. **Agent loop** — retrieves tool schemas formatted for the Vercel AI SDK `tools` parameter so the model can request tool calls

## API

### `defineTool<TInput, TOutput>(def: ToolDefinition<TInput, TOutput>): void`

Registers a single tool. Called at worker startup.

```ts
import { z } from 'zod';

defineTool({
  name: 'fetch_order',
  description: 'Fetch order details by order ID',
  input: z.object({ orderId: z.string() }),
  output: z.object({ status: z.string(), total: z.number() }),
  execute: async ({ orderId }) => {
    const order = await db.orders.find(orderId);
    return { status: order.status, total: order.total };
  },
});
```

### `defineTools(defs: ToolDefinition[]): void`

Convenience for registering multiple tools at once.

### `getToolDefinition(name: string): ToolDefinition`

Returns the full definition (schemas + execute fn). Used by `runTool` activity.

Throws if the tool is not registered.

### `getAISDKTools(names: string[]): Record<string, CoreTool>`

Returns a Vercel AI SDK-compatible `tools` object for a list of tool names. Each entry is formatted using AI SDK's `tool()` helper with a Zod schema and description. This is passed directly to `generateText({ tools })`.

```ts
import { tool } from 'ai';
import { getToolDefinition } from './tool-registry';

function getAISDKTools(names: string[]): Record<string, CoreTool> {
  const tools: Record<string, CoreTool> = {};
  for (const name of names) {
    const def = getToolDefinition(name);
    tools[name] = tool({
      description: def.description,
      parameters: def.input,
    });
  }
  return tools;
}
```

Note: We intentionally do NOT include `execute` in the AI SDK tool definition. Execution happens through our `runTool` Temporal activity (for durability). The AI SDK only uses the schema to let the model generate tool call arguments.

### `getToolSchemas(names: string[]): ToolSchema[]`

Returns JSON Schema representations for serialization across the Temporal activity boundary. Used when passing tool info to `runModel` activity params.

## Design decisions

- **Singleton registry** — same pattern as model registry. Simple, works for single-process workers.
- **Zod for schemas** — gives both TypeScript types and JSON Schema generation (via `zodToJsonSchema`).
- **Execute runs in activity context** — tool execution is wrapped in a Temporal activity, giving it retries, timeouts, and observability automatically.

## Files

- `src/sdk/ai/tool-registry.ts`
