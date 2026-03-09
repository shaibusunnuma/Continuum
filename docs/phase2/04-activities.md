# Part 4: Activities — runModel and runTool

## Quick reference

| Activity | Description |
|----------|-------------|
| `runModel(params)` | Temporal activity: calls the LLM (model from registry, generateText), returns content, toolCalls, usage with costUsd. |
| `runTool(params)` | Temporal activity: looks up tool, validates input with Zod, runs execute(), returns { result }. |

Params: `runModel` takes `RunModelParams` (modelId, messages, toolNames?, responseFormat?); `runTool` takes `RunToolParams` (toolName, input).

## Purpose

Activities are the bridge between the SDK's durable workflow layer and the non-deterministic outside world (LLM APIs, tool execution). Every external call goes through a Temporal activity, giving it automatic retries, timeouts, and history recording.

This module exports two activities that replace the Phase 1 `echo` activity as the core activity set.

## Activities

### `runModel(params: RunModelParams): Promise<RunModelResult>`

1. Look up model in registry → get AI SDK `LanguageModel` instance
2. Build the AI SDK `generateText()` call:
   - Map `params.messages` to AI SDK `CoreMessage[]` format
   - If `params.tools` is provided, reconstruct Zod schemas from the JSON Schema representations (for agent loop) OR use `getAISDKTools()` directly
   - Set `maxTokens` from model config if specified
3. Call `generateText()`
4. Extract `result.text`, `result.toolCalls`, `result.usage`
5. Compute cost via `calculateCostUsd(provider, model, usage)`
6. Return `RunModelResult` with content, toolCalls, and usage (including costUsd)

**Important design note:** For the agent loop, tool schemas need to be passed across the Temporal activity boundary. Since Zod schemas aren't serializable, we pass the tool _names_ and reconstruct the AI SDK tools on the activity side (where registries are available).

Revised params:

```ts
interface RunModelParams {
  modelId: string;
  messages: Message[];
  toolNames?: string[];        // tool names — resolved on activity side
  responseFormat?: 'text' | 'json';
}
```

### `runTool(params: RunToolParams): Promise<RunToolResult>`

1. Look up tool in registry → get `ToolDefinition`
2. Validate `params.input` against the Zod `input` schema
3. Call `def.execute(validatedInput)`
4. Return `{ result }`

If validation fails, throw with a descriptive error (Temporal will record it in the event history).

## Serialization considerations

Temporal serializes activity inputs/outputs as JSON. All params and results use only plain objects, strings, numbers, and arrays. No Zod schemas, class instances, or functions cross the boundary.

The `RunModelParams.toolNames` field (string array) lets the activity side look up the full tool definitions from the in-process registry, keeping the serialization boundary clean.

## Files

- `src/sdk/temporal/activities.ts` — exports `runModel` and `runTool`
