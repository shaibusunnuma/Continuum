# AI Application Runtime — Phase 1

Minimal durable workflow runtime: a Fastify API that starts Temporal workflows and a worker that runs an Echo workflow and activity.

## Prerequisites

- **Node.js** 18+
- **Docker** (for Temporal server)

## 1. Start Temporal server

From the project root:

```bash
cd samples-server/compose && docker-compose -f docker-compose-dev.yml up -d
```

Temporal will listen on **localhost:7233**. Leave this running.

## 2. Config

Copy the example env and adjust if needed:

```bash
cp .env.example .env
```

Defaults:

- `TEMPORAL_ADDRESS=localhost:7233`
- `TEMPORAL_NAMESPACE=default`
- `TASK_QUEUE=ai-runtime`
- `API_PORT=3000`

## 3. Install and run

```bash
npm install
```

**Terminal 1 — Worker:**

```bash
npm run worker
```

You should see: `Worker started, task queue: ai-runtime`

**Terminal 2 — Runtime API:**

```bash
npm run api
```

You should see: `Runtime API listening on port 3000`

## 4. Trigger a workflow

```bash
curl -X POST http://localhost:3000/workflows/start \
  -H "Content-Type: application/json" \
  -d '{"workflowType":"Echo","input":{"message":"hello"}}'
```

Example response (201):

```json
{"workflowId":"...","runId":"..."}
```

## 5. Verify

- **Worker logs:** workflow task and activity execution, then workflow completed.
- **Temporal UI (optional):** if you use the full compose with UI (e.g. port 8080), open a run by `workflowId` and check the event history: WorkflowExecutionStarted → ActivityTaskScheduled → ActivityTaskCompleted → WorkflowExecutionCompleted.

## Testing Phase 2 (SDK workflows and agents)

Phase 2 adds the AI SDK (models, tools, `workflow()`, `agent()`). Use the **example worker** and set **OPENAI_API_KEY** in `.env`.

### 1. Prerequisites

- Temporal server running (see above).
- `.env` with `OPENAI_API_KEY` set (for LLM calls).

### 2. Start the example worker and API

**Terminal 1 — Example worker (SDK workflows + runModel/runTool):**

```bash
npm run worker:examples
```

Wait for: `[ai-runtime] Worker started — task queue: ai-runtime`

**Terminal 2 — Runtime API:**

```bash
npm run api
```

Wait for: `Runtime API listening on port 3000`

### 3. Test customer-support workflow

Start the workflow (use the **export name** `customerSupport` as `workflowType`):

```bash
curl -s -X POST http://localhost:3000/workflows/start \
  -H "Content-Type: application/json" \
  -d '{"workflowType":"customerSupport","input":{"message":"I want a refund for my order","orderId":"ORD-123"}}'
```

Note the `workflowId` from the response, then get the result (wait a few seconds for completion):

```bash
curl -s http://localhost:3000/runs/<workflowId>/result
```

You should see `status: "COMPLETED"` and a `result` with `reply`, `intent`, and `cost`.

### 4. Test travel agent

Start the agent (use the **export name** `travelAgent` as `agentName`):

```bash
curl -s -X POST http://localhost:3000/agents/start \
  -H "Content-Type: application/json" \
  -d '{"agentName":"travelAgent","input":{"message":"Search for flights from NYC to London on March 15th."}}'
```

Get the result (agent may take 15–30 seconds):

```bash
curl -s http://localhost:3000/runs/<workflowId>/result
```

You should see `status: "COMPLETED"`, `result.reply` with flight options, `result.steps` (e.g. 2), and `result.usage`.

### 5. Optional: check run status

```bash
curl -s http://localhost:3000/runs/<workflowId>
```

Returns `workflowId`, `status`, `type`, `startTime`, `closeTime`.

---

**Note:** For Phase 2 tests use `npm run worker:examples`. The Phase 1 worker (`npm run worker`) only has the Echo workflow and will not run SDK workflows or agents.

## Scripts

| Script                | Description                           |
|-----------------------|---------------------------------------|
| `npm run api`         | Start the Runtime API                 |
| `npm run worker`      | Start the Phase 1 worker (Echo only)  |
| `npm run worker:examples` | Start the Phase 2 example worker (SDK workflows + agents) |
| `npm run build`       | Compile TypeScript to dist            |
| `npm run start`       | Alias for `npm run api`               |
