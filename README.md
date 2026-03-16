# AI Application Runtime (Work in Progress)

Durable workflow runtime for AI agents and tools, built on Temporal and the Vercel AI SDK. The current focus is the **Phase 2 SDK**: `workflow()`, `agent()`, `ctx.model()`, and `ctx.tool()` with example workflows and agents.

> **Status:** Early-stage, APIs and internals are still evolving. The SDK design and diagrams will evolve as we go through phases.

## SDK architecture (Phase 2 snapshot)

```mermaid
flowchart LR
  subgraph userCode [User app code]
    WF[workflow()/agent() definitions\nexamples/<name>/workflows.ts]
    CFG[defineModels()/defineTool()\nexamples/<name>/worker.ts]
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
- (optional, Phase 4) `AI_RUNTIME_EVAL_DB_URL=postgres://user:pass@localhost:5432/ai_runtime_eval`

## 3. Install dependencies

From the project root:

```bash
npm install
cd examples && npm install
```

The monorepo has `packages/sdk`, `packages/eval`, and an example REST API in `example-server/`. The **examples** folder has its own `package.json` and dependencies (install from root then run `npm install` in `examples/`).

## 4. Run the examples (SDK workflows and agents)

Each example lives in its own folder under `examples/` and has its own worker. Run **one** example worker at a time.

**Terminal 1 — Example worker**

For the customer-support and travel-agent workflows/agents (OpenAI):

```bash
npm run worker:customer-support
```

For the research-assistant example (Gemini):

```bash
npm run worker:research-assistant
```

Wait for: `[ai-runtime] Worker started — task queue: ai-runtime`

**Terminal 2 — Runtime API**

```bash
npm run api
```

Wait for: `Runtime API listening on port 3000`

See **examples/README.md** for the list of examples and which env vars each needs (`OPENAI_API_KEY` for customer-support, `GEMINI_API_KEY` for research-assistant).

## 5. Test the example workflows and agents

Run the **customer-support** worker first (`npm run worker:customer-support`) so the following workflows and agents are registered.

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

### 5.2 Travel agent (same worker)

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

### 5.3 Research-assistant example (different worker)

If you run `npm run worker:research-assistant` instead, you can test the **contentBrief** workflow and **researchAssistant** agent. Use `workflowType: "contentBrief"` with `input: { "topic": "...", "audience": "..." }`, or `agentName: "researchAssistant"` with `input: { "message": "..." }`. Set `GEMINI_API_KEY` in `.env`.

### 5.4 Optional: check run status

```bash
curl -s http://localhost:3000/runs/<workflowId>
```

Returns `workflowId`, `status`, `type`, `startTime`, `closeTime`.

## 6. Phase 3: Observability stack (optional)

### 6.1 Traces with Jaeger

To view traces (e.g. `ai.run_model`, `ai.run_tool`) in Jaeger:

**1. Start Jaeger with OTLP HTTP:**

```bash
docker run --rm -p 16686:16686 -p 4318:4318 \
  -e COLLECTOR_OTLP_ENABLED=true \
  --name jaeger \
  jaegertracing/all-in-one:1.56
```

**2. Run worker and API with tracing enabled:**

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
export AI_RUNTIME_ENABLE_TRACING=1

# Terminal 1 (run one example worker)
npm run worker:customer-support

# Terminal 2
npm run api
```

**3. Trigger a workflow or agent** (e.g. `customerSupport` or `travelAgent`), then open **http://localhost:16686**. Select service `ai-runtime-example` to see spans and attributes (model, tokens, cost, workflow/agent name).

### 6.2 Metrics with Prometheus + Grafana

The SDK emits metrics like `ai_model_calls_total`, `ai_model_tokens_total`, `ai_model_cost_usd_total`, and `ai_tool_calls_total`. To view them:

**1. Ensure metrics are enabled in `.env`:**

```bash
AI_RUNTIME_ENABLE_METRICS=1
# Optional: change metrics port (prometheus exporter)
# AI_RUNTIME_PROMETHEUS_PORT=9464
```

**2. Start an example worker and the API** (from project root):

```bash
npm run worker:customer-support   # Terminal 1 (or worker:research-assistant)
npm run api                        # Terminal 2
```

**3. Start Prometheus + Grafana with Docker Compose:**

From the project root:

```bash
docker compose -f docker-compose.metrics.yml up
```

This starts:

- Prometheus on `http://localhost:9090` scraping `http://host.docker.internal:9464/metrics`.
- Grafana on `http://localhost:3001` with default login `admin` / `admin`.

**4. Inspect metrics:**

- In **Prometheus** (`http://localhost:9090`) query metrics such as:
  - `ai_model_calls_total`
  - `ai_model_tokens_total`
  - `ai_model_cost_usd_total`
  - `ai_tool_calls_total`
- In **Grafana** (`http://localhost:3001`), add a Prometheus data source with URL `http://prometheus:9090` and build dashboards from the same metric names.

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Build all packages (turbo) |
| `npm run api` | Start the Runtime API server |
| `npm run api:dev` | Start the API with ts-node (dev) |
| `npm run start` | Alias for `npm run api` |
| `npm run worker:customer-support` | Run the customer-support example worker (OpenAI; workflows + travel agent) |
| `npm run worker:research-assistant` | Run the research-assistant example worker (Gemini; content brief + research agent) |
| `npm run eval:build-dataset` | Build a versioned evaluation dataset from captured runs (Phase 4) |
| `npm run eval:run` | Run evaluation metrics over a dataset and print a summary (Phase 4) |
