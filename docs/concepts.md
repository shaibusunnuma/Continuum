# Concepts

## Workflow vs agent

| Primitive | You write | Runtime behavior |
|-----------|-----------|------------------|
| **`workflow()`** | An async function with explicit steps: branches, `ctx.model()`, `ctx.tool()`, `ctx.waitForInput()`, `ctx.run()` | Temporal runs your code deterministically (replay). Each model/tool call is a **durable activity**. |
| **`agent()`** | A declarative config: model id, instructions, tool names, `maxSteps`, optional `budgetLimit`, optional `delegates` | Temporal runs a **generated** workflow that loops: model call → tool activities → repeat until done or limits hit. |

Use a **workflow** when you control the sequence. Use an **agent** when you want the model to choose tools over many steps, with guardrails (steps, cost).

## What “durable” means here

- **`ctx.model()`** and **`ctx.tool()`** are executed inside **Temporal activities**. If the worker crashes, Temporal retries or resumes from the last **completed** activity after replay.
- **Agent loops** still execute **one model call per activity boundary** (and tools as separate activities), so partial progress is not lost the same way as a single long `generateText({ maxSteps: 50 })` in one Node process.

Durability is **orchestration** durability: the workflow’s control flow and activity completions are persisted. It does not replace idempotent design inside your tool implementations.

## The context object (`ctx`)

Inside `workflow()` (and similar patterns), you get:

- **`ctx.input`** — typed workflow input.
- **`ctx.model(modelId, params)`** — call a registered model by id; returns text (or structured output when `schema` is set) plus **`usage`** (tokens, **`costUsd`** when a cost calculator is configured).
- **`ctx.tool(name, input)`** — run a registered tool by name (Zod-validated).
- **`ctx.waitForInput()`** — block until a signal delivers data (human-in-the-loop).
- **`ctx.run(child, input)`** — run a child workflow or agent and await its result.
- **`ctx.metadata`** — read-only run info: **`id`**, **`workflowName`**, **`startedAt`**, **`accumulatedCost`**.

## Temporal concepts you still configure

Durion hides most Temporal APIs, but a few settings remain **your** responsibility:

- **`TASK_QUEUE`** — workers poll a queue; clients must start workflows on the **same** queue (or you pass `taskQueue` explicitly).
- **`workflowsPath`** — path to the workflow bundle entry consumed by `@temporalio/worker`.
- **`workflowId`** — optional on start; useful for idempotency and for correlating HTTP/SSE subscriptions before start.

You do **not** import `@temporalio/workflow` in application code for normal usage; workflow definitions use **`@durion/sdk/workflow`**.

## Human-in-the-loop (HITL)

When a workflow calls **`ctx.waitForInput()`**, it pauses until a **signal** is delivered.

- Default user-input signal name: **`durion:user-input`** (namespaced to avoid collisions).
- Your gateway or client sends that signal with a payload your workflow expects (e.g. `{ action: 'approve' }`).

See [Gateway API v0](gateway-api-v0.md) for HTTP `POST .../signal`.

## Progressive UI: stream state query

Workflows and agents expose a Temporal **query** **`durion:streamState`** with a JSON snapshot (status, optional `partialReply`, `messages`, etc.). A backend can poll that query and expose it over HTTP; **`@durion/react`** hooks can poll your API.

This is **not** the same as token-level SSE; see [Streaming](streaming.md).

## Composability

- **`ctx.run(childWorkflowOrAgent, input)`** — child workflow on the same task queue by default; optional `taskQueue` / `workflowId` overrides.
- **`delegates`** on **`agent()`** — expose other workflows or agents as **tools** the model can call (implemented as child workflows).

## Cost and budgets

- Per-call usage includes token counts and optional **`costUsd`** when you register **cost calculators** on the runtime.
- Agents can enforce **`budgetLimit`** (e.g. **`maxCostUsd`**) across the loop.

Details belong in your worker setup; see the main [README](../README.md) and examples.
