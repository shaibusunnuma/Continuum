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

## Scripts

| Script           | Description                |
|------------------|----------------------------|
| `npm run api`    | Start the Runtime API      |
| `npm run worker` | Start the Temporal worker  |
| `npm run build`  | Compile TypeScript to dist |
| `npm run start`  | Alias for `npm run api`    |
