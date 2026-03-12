# AI Application Runtime (Work in Progress)

Durable workflow runtime for AI agents and tools, built on Temporal and the Vercel AI SDK. The current focus is the **Phase 2 SDK**: `workflow()`, `agent()`, `ctx.model()`, and `ctx.tool()` with example workflows and agents.

> **Status:** Early-stage, APIs and internals are still evolving. The SDK design and diagrams will evolve as we go through phases.

## SDK architecture (Phase 2 snapshot)

```mermaid
flowchart LR
  subgraph userCode [User app code]
    WF[workflow()/agent() definitions\nexamples/workflows.ts]
    CFG[defineModels()/defineTool()\nexamples/worker.ts]
  end

  subgraph sdk [SDK]
    SDKIndex[sdk/index.ts\npublic API re-exports]

    subgraph aiLayer [AI layer]
      MR[model-registry.ts\nstores LanguageModel instances]
      TR[tool-registry.ts\nZod-based tool definitions]
      COST[cost.ts\nuses token-costs\n(openai, anthropic, ...)]
    end

    subgraph temporalLayer [Temporal layer]
      WFAdapter[workflow-adapter.ts\nctx.model()/ctx.tool()/waitForInput]
      Agent[agent-workflow.ts\ndurable agent loop]
      Acts[activities.ts\nrunModel/runTool]
      WorkerF[worker-factory.ts\ncreateWorker()]
    end
  end

  subgraph infra [Infrastructure]
    Temporal[Temporal Server]
    LLMs[LLM providers\n(OpenAI via Vercel AI SDK)]
    Tools[User tools, HTTP/db, etc.]
  end

  CFG --> SDKIndex
  WF --> SDKIndex

  SDKIndex --> MR
  SDKIndex --> TR
  SDKIndex --> WFAdapter
  SDKIndex --> Agent
  SDKIndex --> WorkerF

  WorkerF --> Temporal
  Acts --> LLMs
  Acts --> Tools

  WFAdapter --> Acts
  Agent --> Acts
  Temporal <---> WorkerF
```

High-level flow:

- **App code** defines workflows/agents and configures models/tools.
- **SDK (AI layer)** wires those to concrete Vercel AI SDK models and validated tools, and computes cost via `token-costs`.
- **SDK (Temporal layer)** adapts this into Temporal workflows, activities, and workers for durability.
- **Infrastructure** (Temporal + LLM providers + tools) executes the actual work.

## Prerequisites

- **Node.js** 18+
- **Docker** (for running the Temporal server)

## 1. Start Temporal server

From the project root:

```bash
cd samples-server/compose && docker-compose -f docker-compose-dev.yml up -d
```

Temporal will listen on **localhost:7233**. Leave this running.

## 2. Configure environment

Copy the example env and adjust if needed:

```bash
cp .env.example .env
```

Set at least:

- `TEMPORAL_ADDRESS=localhost:7233`
- `TEMPORAL_NAMESPACE=default`
- `TASK_QUEUE=ai-runtime`
- `API_PORT=3000`
- `OPENAI_API_KEY=...` (or another supported provider key you wire up via `defineModels()`)

## 3. Install dependencies

From the project root:

```bash
npm install
```

## 4. Run the Phase 2 examples (SDK workflows and agents)

Use the **examples worker** to run SDK-based workflows and agents.

**Terminal 1 — Examples worker (SDK workflows + runModel/runTool):**

```bash
npm run worker:examples
```

Wait for: `[ai-runtime] Worker started — task queue: ai-runtime`

**Terminal 2 — Runtime API:**

```bash
npm run api
```

Wait for: `Runtime API listening on port 3000`

## 5. Test the example workflows and agents

### 5.1 Customer-support workflow

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

### 5.2 Travel agent

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

### 5.3 Optional: check run status

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
| `npm run worker`      | Start the Phase 1 worker (Echo only, legacy) |
| `npm run worker:examples` | Start the Phase 2 examples worker (SDK workflows + agents) |
| `npm run build`       | Compile TypeScript to dist            |
| `npm run start`       | Alias for `npm run api`               |
