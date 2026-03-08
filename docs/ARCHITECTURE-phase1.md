# Phase 1 Architecture: Core Workflow Runtime

This document is a **detailed architecture and learning guide** for Phase 1 of the AI Application Runtime. It explains how the pieces fit together and why they are designed this way, so you can implement Phase 1 and understand Temporal as you go.

---

## 1. What Phase 1 Achieves (Goal)

By the end of Phase 1 you will have:

- **Temporal** running as the workflow engine (server + one task queue).
- A **Runtime API** (HTTP service) that starts workflows and returns execution IDs.
- A **Worker** process that executes one workflow and one activity (e.g. “Echo”).
- **No custom event store** — we use Temporal’s built-in event history.
- The ability to **start a workflow via API** and see it **complete** and **inspect its history** in the Temporal UI.

So: “Start workflow via API → worker runs it → workflow completes; event history visible.” That’s the foundation everything else (AI SDK, models, tools, observability) will sit on.

---

## 2. Temporal Concepts You Need (Learning Foundation)

Before diving into our architecture, here are the Temporal concepts that Phase 1 uses. Understanding these will make the rest of the doc and the code much clearer.

### 2.1 Workflow

- **What it is:** A **deterministic** function that describes *control flow* (what happens in what order). It does **not** do I/O, call APIs, or use randomness — only logic and decisions.
- **Why:** Temporal **replays** workflow code from event history to rebuild state after a crash or restart. If the code were non-deterministic, replay would produce different results and break durability.
- **In code:** A workflow is a function registered by name (e.g. `EchoWorkflow`). It receives a context and input, and it **schedules** activities (or child workflows). It gets results back when those complete.

### 2.2 Activity

- **What it is:** A **single unit of work** that can do anything non-deterministic: HTTP calls, DB access, LLM calls, file I/O, etc. It runs in a **worker process**, not inside the workflow engine.
- **Why:** All “real work” and I/O live in activities so that workflow code stays deterministic and replayable.
- **In code:** An activity is a function (e.g. `echoActivity`) that receives input and returns a result. The workflow **schedules** it; Temporal delivers the task to a worker, runs it, and returns the result to the workflow.

### 2.3 Task Queue

- **What it is:** A **named queue** (e.g. `ai-runtime`) that the Temporal server uses to hand out tasks (workflow tasks and activity tasks) to workers.
- **Why:** Workers **poll** a task queue. Multiple workers can poll the same queue for scale; different queues let you route work to different worker pools (we’ll use one queue in Phase 1).

### 2.4 Worker

- **What it is:** A **long-running process** that (1) connects to the Temporal server, (2) registers which workflows and activities it can run, (3) polls a task queue, and (4) executes workflow and activity code when tasks arrive.
- **Why:** The Temporal server does not run your code. It only schedules and tracks work. Your code runs in workers.

### 2.5 Client

- **What it is:** A **client library** (in your API server or CLI) that talks to the Temporal server. It is used to **start** workflows, **signal** them, **query** them, and **get results**.
- **Why:** Your Runtime API will use the client to start workflows; it never runs workflow/activity code itself.

### 2.6 Event History

- **What it is:** For each workflow run, Temporal stores a **sequence of events**: workflow started, activity scheduled, activity completed, timer fired, etc. This is the **source of truth** for that run.
- **Why:** On replay, the workflow code runs again and Temporal “feeds” it the same events so it takes the same path and schedules the same follow-up work. That’s how durability works.

**Learning checkpoint:** You can think of it as: **Workflow = durable, replayable “script.” Activity = actual work. Task queue = delivery channel. Worker = process that runs the script and the work. Client = way to start and interact with workflows.**

---

## 3. High-Level Architecture (Phase 1)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  You (or a script)                                                        │
│  POST /workflows/start { "workflowType": "Echo", "input": { "message": "hi" } }
└─────────────────────────────────────┬────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  RUNTIME API (your service)                                              │
│  - Receives HTTP request                                                  │
│  - Validates input                                                        │
│  - Calls Temporal Client to start workflow                                │
│  - Returns { workflowId, runId } to caller                               │
└─────────────────────────────────────┬────────────────────────────────────┘
                                      │  Temporal Client SDK
                                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  TEMPORAL SERVER (you don’t write this)                                   │
│  - Receives "Start Workflow" from client                                  │
│  - Creates a new workflow execution and event history                     │
│  - Puts a "workflow task" on the task queue                               │
└─────────────────────────────────────┬────────────────────────────────────┘
                                      │  Task Queue: "ai-runtime"
                                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  WORKER (your process)                                                   │
│  - Polls task queue "ai-runtime"                                          │
│  - Picks up workflow task → runs EchoWorkflow                             │
│  - Workflow schedules "Echo" activity → Temporal puts activity task      │
│    on same queue → worker picks it up → runs echoActivity                 │
│  - Activity result goes back to server → workflow continues → completes  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Important:** The Runtime API and the Worker are **separate processes**. The API only starts work; the Worker does the work. Both talk to the Temporal server.

---

## 4. Component Breakdown

### 4.1 Temporal Server

- **Role:** Workflow engine. Stores event history, manages task queues, assigns tasks to workers, handles timeouts and retries.
- **How you run it (Phase 1):**
  - **Option A:** Docker Compose with [Temporal server + dependencies](https://docs.temporal.io/self-hosted-guide) (recommended for learning).
  - **Option B:** [Temporal Cloud](https://temporal.io/cloud) (hosted; no Docker).
- **You do not modify or fork it.** You only run it and connect to it.

### 4.2 Runtime API

- **Role:** HTTP front door for “start a workflow.” Later you’ll add “get status,” “cancel,” “signal,” etc.
- **Responsibilities:**
  1. Accept `POST /workflows/start` (or similar) with body: `{ "workflowType": "Echo", "input": { ... } }`.
  2. Create a Temporal client (or reuse a singleton) connected to the Temporal server.
  3. Call `client.workflow.start(workflowType, options, input)`.
  4. Return `{ "workflowId": "...", "runId": "..." }` so the caller can track the run (and later query status or result).
- **Technology:** TypeScript with **Node** and an HTTP framework (e.g. **Express** or **Fastify**). Same repo as the worker so you share types and config.
- **Config:** Server address (e.g. `localhost:7233`), namespace (e.g. `default`), task queue name (e.g. `ai-runtime`). No database required in Phase 1.

### 4.3 Worker

- **Role:** Execute workflow and activity code.
- **Responsibilities:**
  1. Create a Temporal client and connect to the same server/namespace.
  2. Create a Worker that polls the task queue `ai-runtime`.
  3. Register the **workflow**: `EchoWorkflow` (by name and implementation).
  4. Register the **activity**: `echoActivity` (by name and implementation).
  5. Run the worker (e.g. `worker.run()`). It will loop, poll for tasks, and execute them.
- **Workflow code (EchoWorkflow):**
  - Receives input (e.g. `{ message: string }`).
  - Schedules the `echoActivity` with that input (e.g. `ctx.executeActivity(echoActivity, { message })`).
  - Returns the activity result. That’s it. One workflow, one activity.
- **Activity code (echoActivity):**
  - Receives the same input and returns it (e.g. `return { echoed: input.message }`). No I/O required for learning; later you’ll replace this with “call LLM” or “call tool.”

### 4.4 Minimal SDK (Optional in Phase 1)

- **Role:** Thin wrapper so starting a workflow doesn’t require calling the Temporal client directly. Useful for tests and for consistency with later phases.
- **Scope for Phase 1:** One function, e.g. `startWorkflow(workflowType, input)` that calls the Runtime API or the Temporal client. Not required for “exit criteria,” but good practice.

---

## 5. Data Flow (Step by Step)

Here’s what happens for one request: **POST /workflows/start** with `{ "workflowType": "Echo", "input": { "message": "hello" } }`.

1. **Runtime API** receives the request. It might generate a `workflowId` (e.g. UUID) or let Temporal generate one. It calls:
   - `temporalClient.workflow.start("Echo", { taskQueue: "ai-runtime", workflowId }, { message: "hello" })`.
2. **Temporal Server** creates a new run, appends a `WorkflowExecutionStarted` event to the history, and enqueues a **workflow task** on the queue `ai-runtime`.
3. **Worker** is polling `ai-runtime`. It gets the workflow task, loads the workflow code `EchoWorkflow`, and **replays** the event history (so far only “started”). The workflow code runs and schedules the activity; the worker sends an **activity schedule** command to the server.
4. **Temporal Server** appends `ActivityTaskScheduled` to the history and enqueues an **activity task** on `ai-runtime`.
5. **Worker** picks up the activity task, runs `echoActivity({ message: "hello" })`, gets `{ echoed: "hello" }`, and reports the result to the server.
6. **Temporal Server** appends `ActivityTaskCompleted` with the result. It then enqueues another **workflow task** so the workflow can continue.
7. **Worker** runs the workflow again (replay from the beginning with the new event). This time, the “execute activity” call returns the result. The workflow function returns that result and completes.
8. **Temporal Server** appends `WorkflowExecutionCompleted` and marks the run as completed.

The caller only got back `workflowId` and `runId` from step 1. To get the result, they could (in a later step) call **GET /workflows/:id/result** or use the Temporal client/UI to query the run. Phase 1 can end with “we can start and see completion in the UI”; adding a “get result” endpoint is a small extension.

---

## 6. Suggested Project Layout (TypeScript)

Keep everything in one repo so the Runtime API and Worker share types and config. Use the **Temporal TypeScript SDK** (`temporalio/client`, `temporalio/worker`, `temporalio/workflow`, `temporalio/activity`).

```
project-root/
├── package.json              # dependencies: temporalio, express (or fastify), dotenv
├── tsconfig.json             # target ES2020+, strict, outDir dist/
├── .env.example               # TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE, TASK_QUEUE, API_PORT
│
├── src/
│   ├── api/
│   │   ├── index.ts          # HTTP server (Express/Fastify), mount routes
│   │   ├── routes/
│   │   │   └── workflows.ts  # POST /workflows/start → getTemporalClient().workflow.start(...)
│   │   └── temporal.ts       # getTemporalClient() singleton (Client from @temporalio/client)
│   │
│   ├── worker/
│   │   ├── index.ts          # NativeConnection + Worker.create() + worker.run()
│   │   ├── workflows/
│   │   │   └── echo.ts       # EchoWorkflow (proxy + impl in path for bundling)
│   │   └── activities/
│   │       └── echo.ts       # echoActivity
│   │
│   ├── shared/
│   │   ├── config.ts         # load env (dotenv), export TEMPORAL_*, TASK_QUEUE, API_PORT
│   │   └── types.ts          # EchoInput, EchoOutput, StartWorkflowRequest, etc.
│   │
│   └── sdk/                  # Optional for Phase 1
│       └── client.ts         # startWorkflow(workflowType, input) → fetch API or use Client
│
├── docker-compose.yml        # Temporal server + UI (optional) + dependencies
└── README.md                 # How to run server, API, worker; how to call API and check UI
```

**TypeScript + Temporal notes:**

- **Workflow code** must run in the Temporal **workflow sandbox** (V8 isolate). You will use **path-based registration**: point the worker at workflow and activity **paths** (or a single bundle), not inline functions. The SDK docs call this “bundled workflows” or “workflow bundle.”
- **Activities** are plain async functions; they run in the Node environment, so you can use any Node/TS APIs there.
- **shared/config.ts** ensures API and Worker use the same namespace and task queue.
- **shared/types.ts** keeps workflow/activity payloads typed; use the same types in API, workflow, and activity so request/response and activity I/O stay consistent.
- **docker-compose.yml** can use the official [Temporal Docker Compose](https://github.com/temporalio/docker-compose) so you don’t install the server locally.

---

## 7. API Contract (Phase 1)

### Start workflow

- **Endpoint:** `POST /workflows/start`
- **Request body:**
  ```json
  {
    "workflowType": "Echo",
    "input": { "message": "hello" }
  }
  ```
- **Response (201):**
  ```json
  {
    "workflowId": "uuid-or-custom-id",
    "runId": "temporal-run-id"
  }
  ```
- **Errors:** 400 if `workflowType` or `input` is invalid; 502 if Temporal is unreachable.

Optional later in Phase 1:

- **GET /workflows/:workflowId/result** — return result of the workflow (or “pending” if not completed). Implement by using the Temporal client to describe the run or to get the result of the workflow.

---

## 8. Configuration and Environment

Use environment variables (and `.env.example`) so the same code works locally and in a container.

| Variable           | Meaning                    | Example (local)     |
|--------------------|----------------------------|---------------------|
| `TEMPORAL_ADDRESS` | Temporal server address    | `localhost:7233`    |
| `TEMPORAL_NAMESPACE` | Namespace                | `default`           |
| `TASK_QUEUE`       | Task queue name            | `ai-runtime`        |
| `API_PORT`         | Port for Runtime API       | `3000`              |

Worker and API both read `TEMPORAL_*` and `TASK_QUEUE`; only the API needs `API_PORT`.

---

## 9. Running the System (Order of Operations)

1. **Start Temporal server**  
   `docker-compose up -d` (or use Temporal Cloud and set `TEMPORAL_ADDRESS` accordingly).

2. **Start the Worker**  
   `npm run worker` (e.g. `ts-node src/worker/index.ts` or `node dist/worker/index.js` after `npm run build`). It should connect and log “Worker started” and poll the task queue.

3. **Start the Runtime API**  
   `npm run api` (e.g. `ts-node src/api/index.ts` or `node dist/api/index.js`). It should bind to `API_PORT`.

4. **Trigger a run**  
   `curl -X POST http://localhost:3000/workflows/start -H "Content-Type: application/json" -d '{"workflowType":"Echo","input":{"message":"hello"}}'`

5. **Verify**  
   - Worker logs: workflow task received, activity executed, workflow completed.
   - Temporal Web UI (if you started it with Docker): open the run by `workflowId` and inspect the **event history** (WorkflowExecutionStarted → ActivityTaskScheduled → ActivityTaskCompleted → WorkflowExecutionCompleted).

---

## 10. Learning Path While Building

- **After implementing the API:** You understand “client starts workflow; server enqueues work.”
- **After implementing the worker:** You understand “worker runs workflow code and activities; workflow only schedules activities and uses their results.”
- **After seeing event history in the UI:** You understand “durability = event history + replay.” That’s the core of Phase 1.

Optional deepening:

- **Kill the worker** mid-run and restart it. The workflow should resume and complete (replay + activity retry).
- **Add a second activity** (e.g. “delay 2 seconds”) and see two activity tasks in the history.

---

## 11. Phase 1 Exit Checklist

- [ ] Temporal server runs (Docker or Cloud).
- [ ] One task queue (`ai-runtime`) is used by the worker.
- [ ] Runtime API: `POST /workflows/start` with `workflowType: "Echo"` and `input` starts a workflow and returns `workflowId` and `runId`.
- [ ] Worker: registers `EchoWorkflow` and `echoActivity`; runs and completes when the API starts a run.
- [ ] Event history for that run is visible in Temporal Web UI and shows: started → activity scheduled → activity completed → workflow completed.
- [ ] (Optional) GET endpoint or client call to fetch workflow result.

Once this is solid, you have a **minimal durable workflow runtime**. Phase 2 will add the AI SDK (`ctx.model`, `ctx.tool`) and real model/tool activities on top of this same architecture.

---

## 12. TypeScript Stack Summary

| Piece            | Package / tech |
|------------------|----------------|
| Temporal client  | `@temporalio/client` |
| Worker + workflow + activity | `@temporalio/worker`, `@temporalio/workflow`, `@temporalio/activity` |
| Runtime API      | `express` or `fastify`, `dotenv` |
| Config           | `dotenv` + `process.env` in `shared/config.ts` |
| Scripts          | `ts-node` for dev; `tsc` + `node` for prod, or `tsx` for both |

**Worker workflow bundle (important):** In TypeScript, workflow code runs inside a V8 isolate. You typically either (1) use a **separate workflow bundle** (e.g. `tsconfig.worker.json` and `npx temporal-workflow-bundle` or similar) and pass the bundle path to `Worker.create()`, or (2) use the **path-based workflow registration** with a dedicated entry file that only imports workflow and activity modules. See the [Temporal TypeScript “Run a worker” docs](https://docs.temporal.io/develop/typescript/run-your-first-app) for the exact pattern (e.g. `workflowsPath` and `activities`). Phase 1 only needs one workflow and one activity, so start with the minimal path-based example from the official tutorial.
