# Plan: Simple AI Application Runtime

## Executive summary

This plan turns the **AI Application Runtime** from `idea.md` into a concrete build strategy. The main decision—**build on top of Temporal vs modify the engine**—is resolved as: **build on top of Temporal**. Use Temporal as the workflow engine and add an AI-native SDK, runtime API, model routing, evaluation, and observability on top. Do not fork or modify Temporal’s core.

---

## 1. Build on Temporal vs modify the engine

### 1.1 Recommendation: **Build on top of Temporal**

| Criterion | Build on Temporal | Modify / fork Temporal |
|-----------|-------------------|-------------------------|
| **Time to value** | Fast: reuse durability, replay, queues, workers | Slow: large Go/Java codebase, deep workflow semantics |
| **Maintenance** | You get fixes and features from upstream | You own all durability, replay, and scaling logic |
| **Fit to idea** | Matches “workflow engine like Temporal” in idea §6.3 | Overkill unless you need different core semantics |
| **AI use today** | Used in production (Replit, Retool, Gorgias; OpenAI Codex) | No clear benefit from forking for “AI-native” |
| **Risk** | Bounded by Temporal’s API and scaling limits | High: reinventing event-sourcing and determinism |

**Conclusion:** Use Temporal as the workflow engine. Differentiate with **AI-native abstractions** (models, tools, agents, evaluation, routing) and **operational features** (AI metrics, eval pipeline, edge) in a layer above Temporal, not inside it.

---

## 2. Research summary: why Temporal fits

### 2.1 Alignment with idea.md

- **Durable execution (§4.1)**  
  Temporal gives exactly this: workflows survive crashes, API failures, and rate limits; executions are resumable.

- **Deterministic workflow + activities (§4.2)**  
  Workflow code is deterministic and replayable; non-deterministic work (LLM calls, tools, APIs) goes in Activities. Your “activities = external work” maps 1:1.

- **Event-sourced architecture (§4.3)**  
  Temporal keeps an event history; state is replayed from events. You get debugging, reproducibility, and auditing without building it.

- **Architecture (§6)**  
  Your stack maps cleanly:
  - **SDK** → Temporal client + your AI SDK (workflows, `ctx.model`, `ctx.tool`).
  - **Runtime API** → Your API server that starts/signals/queries workflows via Temporal client.
  - **Workflow engine** → Temporal server (no modification).
  - **Task queues + workers** → Temporal task queues and workers; your workers run activities (inference, tools, retrieval, eval).

### 2.2 What Temporal already provides for AI

- **Long-running workflows**  
  Workflows can run for hours or days; for very long or high-event-count runs, Continue-As-New is the supported pattern.

- **AI-oriented docs and integrations**  
  Temporal has an AI solution page, durable AI agent tutorials, multi-agent workflow guidance, and integrations (e.g. Vercel AI SDK, OpenAI). LLM calls are treated as activities (non-deterministic), which matches your design.

- **Production usage**  
  Replit, Retool, Gorgias use Temporal for agents; OpenAI uses it for Codex. So the “reliable execution” and “operational layer” you want are already proven on Temporal.

### 2.3 What you add on top (don’t modify Temporal)

- **AI-native API**  
  `ctx.model("intent-classifier")`, `ctx.tool("get-order")` instead of raw activity handles and task queue names.

- **Model routing**  
  Logic to choose model by latency, cost, complexity, environment (e.g. simple → small model, complex → large model). Implement in your SDK/runtime, calling through activities.

- **Evaluation pipeline**  
  Production outputs → evaluation dataset → automated scoring → prompt comparison. Implement as workflows + activities + storage; Temporal is the executor, not the evaluator.

- **AI observability**  
  Token usage, cost per execution, model error rates, tool failure rates, and any “hallucination” or quality signals. Emit from activities and workflow code into your metrics/traces.

- **Edge execution**  
  Later phase: workers in edge/cloud and routing rules. Temporal supports multiple task queues and workers; you add placement and routing policy.

So: **Temporal = workflow engine**. Your value = **abstractions, routing, evaluation, and observability** on top.

---

## 3. When modifying Temporal might (rarely) make sense

Consider a fork or deep customization only if:

- You need **fundamentally different durability or replay semantics** (e.g. different event model, different consistency guarantees).
- You need **very different scaling or deployment constraints** (e.g. embedded, strict edge, or custom persistence) that Temporal’s extension points cannot address.
- You are willing to **maintain a fork** of a large, critical codebase and keep up with upstream.

For a “simple AI application runtime” and the scope in idea.md, none of these are required. **Stick with “build on top.”**

---

## 4. Implementation plan (phased)

Phases match idea.md §14 and assume Temporal as the engine from day one.

### Phase 1 — Core workflow runtime (foundation)

**Goal:** Minimal durable workflow execution using Temporal, plus your API and one task queue.

**Deliverables:**

1. **Temporal in the loop**
   - Run Temporal server (Docker or Temporal Cloud).
   - One namespace, one task queue (e.g. `default` or `ai-runtime`).

2. **Runtime API**
   - REST or gRPC service that:
     - Starts workflows (workflow type + input).
     - Returns run ID / execution ID.
     - Optional: signal, query, cancel, describe (can be Phase 2).

3. **Worker process**
   - Single worker that:
     - Registers one “hello world” workflow (e.g. single activity that returns a string).
     - Runs that activity (e.g. echo or tiny LLM stub).

4. **Event history**
   - Rely on Temporal’s event history (no extra event store yet). Optionally: export events to your DB for analytics later.

5. **Minimal SDK (optional in P1)**
   - Thin wrapper: “start workflow by name with payload” from API and from a small SDK (TypeScript; see ARCHITECTURE-phase1.md). No `ctx.model`/`ctx.tool` yet.

**Exit criteria:** Start a workflow via API → worker runs it → workflow completes; event history visible in Temporal UI.

---

### Phase 2 — AI SDK and abstractions

**Goal:** Developers write workflows in terms of models and tools, not raw activities.

**Deliverables:**

1. **Workflow DSL / SDK**
   - In workflow code:
     - `ctx.model("model-id")` → schedules an “LLM” activity, returns result.
     - `ctx.tool("tool-name", args)` → schedules a tool activity, returns result.
   - Implement `model` and `tool` as wrapper activities that dispatch to the right task queue or activity implementation.

2. **Model abstraction**
   - Registry of “model ids” → provider + model name (e.g. OpenAI GPT-4, local model).
   - One activity (e.g. `runModel`) that takes model id + input and calls the right provider. No routing logic yet (single model or fixed mapping is fine).

3. **Tool system**
   - Registry of tools (name → activity or handler).
   - `ctx.tool("get-order", { orderId })` maps to a “run tool” activity that invokes the right handler. At least 2–3 example tools (e.g. get-order, search, echo).

4. **Example workflow**
   - One workflow from idea.md, e.g. “customer-support”: intent → branch → tool → model. Runs end-to-end with real or stubbed model/tools.

**Exit criteria:** Define and run the customer-support workflow using only `ctx.model` and `ctx.tool`; no raw activity calls in user code.

---

### Phase 3 — Observability and reliability

**Goal:** Production-ready visibility and robustness without changing Temporal’s engine.

**Deliverables:**

1. **Execution traces**
   - Trace per workflow run (span per activity: model call, tool call). Use OpenTelemetry or Temporal’s tracing; propagate trace ID from API to worker.

2. **Metrics**
   - Workflow: start rate, completion rate, duration, failure rate.
   - Activities: latency, failure rate, retry count.
   - AI-specific: token usage and cost per execution (from activity results or sidecars). Export to Prometheus/StatsD or your metrics backend.

3. **Dashboards**
   - One dashboard: workflow runs, activity latency, errors, token/cost (if available). Use Grafana or your cloud’s dashboard.

4. **Retries and timeouts**
   - Configure activity timeouts and retries (Temporal primitives). Document best practices for LLM and tool activities (e.g. start-to-close, schedule-to-close, backoff).

**Exit criteria:** Every run is traceable; metrics and dashboard show workflow and activity health and basic cost/token data.

---

### Phase 4 — Evaluation system

**Goal:** Turn production runs into evaluation datasets and scores.

**Deliverables:**

1. **Capture production outputs**
   - From workflow/activity completion (or from a “capture” activity at the end of a run), write inputs/outputs to an evaluation store (DB or object store). Optional: sampling or filtering (e.g. by tag, model, or random).

2. **Evaluation dataset**
   - Pipeline (batch or on-demand) that builds datasets from captured runs (e.g. prompt + expected/actual, or pairwise). Versioned datasets.

3. **Automated scoring**
   - Runner that runs a workflow or activity over a dataset and computes metrics (e.g. accuracy, latency, cost). No need for fancy ML eval at first; simple rules or LLM-as-judge are fine.

4. **Prompt comparison**
   - Support A/B or multi-variant: same dataset, different prompts/models; compare scores. Store results and show in a simple UI or report.

**Exit criteria:** Production runs can be captured; one dataset can be scored; at least two prompt/config variants can be compared.

---

### Phase 5 — Model routing and edge (later)

**Goal:** Smarter model selection and optional edge deployment.

**Deliverables:**

1. **Model routing**
   - Router (in SDK or runtime) that chooses model id from: latency SLO, cost budget, complexity hint, or environment. Implement as config + logic before calling `runModel` activity; multiple task queues per model tier if needed.

2. **Edge execution (optional)**
   - Workers that can run in edge regions or on-prem; separate task queues for “edge” vs “cloud.” Routing rules (e.g. by region or device) to decide which queue. No change to Temporal core; only worker placement and queue assignment.

**Exit criteria:** At least two “tiers” (e.g. fast vs accurate) selectable by policy; optional edge worker runs activities.

---

## 5. Architecture: your runtime on Temporal

```
┌─────────────────────────────────────────────────────────────────┐
│  Developer                                                       │
│  ai.workflow("support", async (ctx) => { ... })                  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│  AI Runtime SDK (your code)                                      │
│  - ctx.model(), ctx.tool()                                       │
│  - workflow registration, activity stubs                         │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│  AI Runtime API (your service)                                   │
│  - Start / signal / query workflows                               │
│  - Wraps Temporal client                                          │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│  Temporal (unchanged)                                            │
│  - Workflow engine, event history, task queues                    │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│  Workers (your code)                                             │
│  - Inference worker (model activity)                             │
│  - Tool worker (tool activities)                                 │
│  - Optional: eval worker, retrieval worker                       │
└─────────────────────────────────────────────────────────────────┘
```

- **Do not modify** the Temporal box. All “AI runtime” behavior lives in SDK, API, and workers.
- **Event store:** Use Temporal’s history as the source of truth; optionally copy events to your store for analytics and evaluation.

---

## 6. Technology choices (concrete)

- **Language:** TypeScript (Node.js).
- **Workflow engine:** Temporal (server: Docker or Temporal Cloud; SDK: `@temporalio/client`, `@temporalio/worker`, `@temporalio/workflow`, `@temporalio/activity`).
- **Runtime API:** Node/TypeScript; HTTP framework: Express or Fastify.
- **Workers:** Same language as SDK; run as long-lived processes (or K8s/cron for batch eval).
- **Observability:** OpenTelemetry + Prometheus/Grafana or cloud equivalent; optional: Temporal Web UI.
- **Evaluation store:** PostgreSQL or object store (e.g. S3) for captures and datasets; simple runner script or small service for scoring.

---

## 7. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Temporal’s learning curve | Start with one workflow and one activity; use official AI tutorials and cookbooks. |
| Vendor lock-in to Temporal | Keep workflow definitions in your SDK; activities are plain functions. Swapping engine later would require a new execution layer but not a rewrite of business logic. |
| Event history size (50k/50MB limit) | Use Continue-As-New for long-lived or high-event workflows; document in developer guide. |
| Overlapping with “generic” Temporal | Differentiate strictly via AI-native APIs (model, tool, eval, routing); avoid exposing raw Temporal concepts in the main SDK. |

---

## 8. Success criteria (from idea.md, made measurable)

- Developers can build an AI workflow using only `ctx.model` and `ctx.tool` (Phase 2).
- Workflows complete reliably across failures and retries (Phase 1–3).
- Every run is observable (traces, metrics, dashboard) (Phase 3).
- Production runs can be turned into evaluation datasets and compared (Phase 4).
- Platform is the default runtime for your own AI apps and demos (ongoing).

---

## 9. Next steps

1. **Set up Temporal** (local Docker or Temporal Cloud) and run the official “durable AI agent” or “hello world” tutorial in your chosen SDK language.
2. **Implement Phase 1:** API that starts a single Temporal workflow; one worker with one workflow and one activity; verify event history.
3. **Design the Phase 2 SDK:** Exact signatures for `ctx.model` and `ctx.tool`, and mapping to activity names and task queues. Implement one model activity and two tool activities, then the customer-support workflow.

After Phase 2 you will have a “simple AI application runtime” that is durable, observable, and ready to extend with evaluation and routing—all **on top of** Temporal, without modifying the engine.
