# Composability example

Demonstrates:

1. **`ctx.run()`** — `composabilityParent` runs `composabilityChild` as a Temporal child workflow, then calls the model.
2. **`delegates`** — `composabilityOrchestrator` can hand off to `composabilitySpecialist` via the `specialist` tool (implemented as `executeChild`, not an activity).

**Layout:** `workflows.ts` (bundle), **`run.ts`** — `worker` mode uses `createApp` + `createWorker`; **`demo`** uses **`createClient` only** (no second `createApp`). Shared queue name lives in `temporal-config.ts`. For a client in another service, copy only the `demo` path; see [REMOTE_CLIENT.md](../REMOTE_CLIENT.md).

## Prerequisites

- Temporal running (e.g. `localhost:7233`)
- Repo root `.env` with `OPENAI_API_KEY` (and optional `TEMPORAL_ADDRESS` / `TEMPORAL_NAMESPACE`)

## Run

From repo root (after `npm run build`):

```bash
# Terminal 1
npm run worker:composability

# Terminal 2 — parent + child workflow
npm run client:composability -- parent "hello world"

# Terminal 2 — orchestrator agent (may call specialist delegate)
npm run client:composability -- orchestrator "Ask the specialist to explain what an API is in one sentence."
```

Workflow type strings match the **first argument** to `workflow()` / `agent()` (e.g. `'composabilityParent'`, `'composabilityOrchestrator'`).
