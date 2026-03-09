# Part 5: Workflow and Agent Primitives

## Quick reference

| Function | Description |
|----------|-------------|
| `workflow(name, fn)` | Returns a Temporal workflow function. Use the same name as the export (e.g. `customerSupport`). `fn` receives ctx (input, model, tool, waitForInput, log, run). |
| `agent(name, config)` | Returns a Temporal workflow function that runs a durable model–tool loop. Input: `{ message: string }`. Config: model, instructions, tools, maxSteps?, budgetLimit?. |

Both return workflow functions; export them and point `workflowsPath` at the file that exports them. Start workflows by the **export name** (e.g. `workflowType: "customerSupport"`), not the string passed to `workflow()`.

## Purpose

These are the two core execution primitives developers use. Both produce Temporal-compatible workflow functions, but developers never see Temporal APIs.

## `workflow(name, fn)` — explicit control flow

### What the developer writes

```ts
import { workflow } from '@ai-runtime/sdk';

export const customerSupport = workflow('customer-support', async (ctx) => {
  const intent = await ctx.model('fast', {
    prompt: `Classify this intent: ${ctx.input.message}`,
  });

  if (intent.result.includes('refund')) {
    const order = await ctx.tool('fetch_order', { orderId: ctx.input.orderId });
    const response = await ctx.model('reasoning', {
      messages: [
        { role: 'system', content: 'You are a support agent.' },
        { role: 'user', content: `Process refund for order: ${JSON.stringify(order.result)}` },
      ],
    });
    return { reply: response.result, cost: ctx.run.accumulatedCost };
  }

  return { reply: intent.result, cost: ctx.run.accumulatedCost };
});
```

### What happens under the hood

`workflow()` returns a Temporal workflow function. Inside, it:

1. Creates a `ctx` object with `proxyActivities` wired to `runModel` and `runTool`
2. Maps `ctx.model()` → calls the `runModel` activity with the given model ID and params
3. Maps `ctx.tool()` → calls the `runTool` activity with the tool name and input
4. Maps `ctx.waitForInput()` → defines a Temporal signal + waits via `condition()`
5. Tracks `accumulatedCost` by summing `usage.costUsd` from each model call
6. Generates a unique `workflowId` or uses the one from Temporal's `workflowInfo()`

### Temporal mapping

| SDK concept | Temporal concept |
|---|---|
| `ctx.model()` | `proxyActivities<>().runModel()` |
| `ctx.tool()` | `proxyActivities<>().runTool()` |
| `ctx.waitForInput()` | `defineSignal()` + `setHandler()` + `condition()` |
| `ctx.log()` | Workflow logging (for event history) |
| Cost tracking | In-workflow state accumulation |

## `agent(name, config)` — autonomous agent loop

### What the developer writes

```ts
import { agent } from '@ai-runtime/sdk';

export const travelAgent = agent('travel-agent', {
  model: 'reasoning',
  instructions: 'You are a travel booking agent. Help users find and book flights.',
  tools: ['search_flights', 'book_flight', 'get_user_preferences'],
  maxSteps: 15,
  budgetLimit: { maxCostUsd: 0.50 },
});
```

### What happens under the hood

`agent()` generates a Temporal workflow function that implements a durable agent loop:

```
loop:
  1. Call runModel activity (with tool schemas + conversation history)
  2. If model returns tool calls:
     a. For each tool call → call runTool activity
     b. Append tool results to conversation history
     c. Continue loop
  3. If model returns text (no tool calls) → return final result
  4. Check budget/step limits → break if exceeded
```

Each iteration is a separate Temporal activity call, meaning:
- The loop survives server crashes (Temporal replays from history)
- Each LLM call and tool call has individual retry policies
- The full conversation history is stored in Temporal's event store

### Agent loop state

```ts
interface AgentLoopState {
  messages: Message[];       // full conversation history
  stepCount: number;
  totalCost: number;
  totalTokens: number;
}
```

### Budget enforcement

Before each model call, the loop checks:
- `stepCount < maxSteps` (default: 10)
- `totalCost < budgetLimit.maxCostUsd` (if set)
- `totalTokens < budgetLimit.maxTokens` (if set)

If any limit is hit, the loop exits with the current state and a `finishReason: 'budget_exceeded' | 'max_steps'`.

### Agent result

```ts
interface AgentResult {
  reply: string;
  finishReason: 'complete' | 'max_steps' | 'budget_exceeded';
  steps: number;
  usage: Usage;   // total accumulated usage
}
```

## Workflow registration

Both `workflow()` and `agent()` store their generated Temporal workflow functions in a registry so the worker factory (Part 6) can register them all.

```ts
const workflowRegistry = new Map<string, Function>();
```

A `src/sdk/workflows/index.ts` file re-exports all registered workflows for Temporal's `workflowsPath` bundling.

## Files

- `src/sdk/temporal/workflow-adapter.ts` — the `workflow()` function
- `src/sdk/temporal/agent-workflow.ts` — the `agent()` function
- `src/sdk/temporal/workflow-registry.ts` — shared registry for both
- `src/sdk/workflows/index.ts` — re-exports for Temporal bundling
