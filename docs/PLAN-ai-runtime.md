# Plan: AI Application Runtime

## Executive summary

This plan turns the **AI Application Runtime** from `idea.md` into a concrete build strategy. **Build on top of Temporal** — use it as the workflow engine and add an AI-native SDK, runtime API, model routing, evaluation, and observability on top. Do not fork or modify Temporal's core.

The central design bet: **developers think in agents, models, and tools — never in workflows, activities, or task queues.** Temporal concepts must be invisible to users of our SDK. This is what separates "a wrapper on Temporal" from "a new abstraction layer." See `SDK-DESIGN.md` for the full SDK architecture.

---

## 0. Competitive landscape (March 2026)

Understanding who else is building here and where the gaps are.

### 0.1 Temporal ($5B, $300M Series D, Feb 2026)

Temporal is aggressively moving into AI: OpenAI Agents SDK integration (public preview), AI cookbook, AI solution page. Customers include OpenAI, Replit, Retool, Snap. 380% YoY revenue growth. But Temporal is a **general-purpose workflow engine** — it provides durable execution, not AI-specific abstractions. Developers must still understand activities, signals, task queues, and workflow determinism.

### 0.2 Direct competitors

| Company | Approach | Differentiator | Gap |
|---------|----------|----------------|-----|
| **Runboard** | Built on Temporal (Python) | Multi-agent pipelines, approval gates, multi-model routing | Python-only; focused on software agents, not general AI apps |
| **inference.sh** | Custom runtime | Auto-checkpointing, 150+ tool integrations, UI components | Closed platform; not an open engine developers can self-host |
| **Kruxia Flow** | Custom engine (7.5MB binary + Postgres) | Built-in LLM cost tracking, budget controls, model fallback | AGPL license; no community; limited ecosystem |
| **Temporal + OpenAI Agents SDK** | Official integration | Durable agents using OpenAI primitives | Python-only; requires understanding Temporal concepts; tied to OpenAI |

### 0.3 Our positioning

None of the above provide a **TypeScript-first, provider-agnostic AI runtime with a developer surface that completely hides the workflow engine**. Our positioning:

> **A durable execution runtime where developers define agents, models, and tools — not workflows and activities.**

Key differentiators we will build:
- **Invisible infrastructure**: no Temporal concepts in developer code
- **Hybrid abstraction**: both explicit workflows and autonomous durable agents
- **Built-in cost tracking**: every model call tracks tokens and cost from day one
- **TypeScript-first**: matches the largest web/AI developer ecosystem
- **Provider-agnostic**: works with any LLM provider, not locked to OpenAI

---

## 1. Build on Temporal vs modify the engine

### 1.1 Recommendation: **Build on top of Temporal**

| Criterion | Build on Temporal | Modify / fork Temporal |
|-----------|-------------------|-------------------------|
| **Time to value** | Fast: reuse durability, replay, queues, workers | Slow: large Go/Java codebase, deep workflow semantics |
| **Maintenance** | You get fixes and features from upstream | You own all durability, replay, and scaling logic |
| **Fit to idea** | Matches "workflow engine like Temporal" in idea §6.3 | Overkill unless you need different core semantics |
| **AI use today** | Used in production (Replit, Retool, Gorgias; OpenAI Codex) | No clear benefit from forking for "AI-native" |
| **Risk** | Bounded by Temporal's API and scaling limits | High: reinventing event-sourcing and determinism |

**Conclusion:** Use Temporal as the workflow engine. Differentiate with **AI-native abstractions** (models, tools, agents, evaluation, routing) and **operational features** (AI metrics, eval pipeline, edge) in a layer above Temporal, not inside it.

---

## 2. Research summary: why Temporal fits

### 2.1 Alignment with idea.md

- **Durable execution (§4.1)** — Temporal gives exactly this: workflows survive crashes, API failures, and rate limits; executions are resumable.
- **Deterministic workflow + activities (§4.2)** — Workflow code is deterministic and replayable; non-deterministic work (LLM calls, tools, APIs) goes in Activities.
- **Event-sourced architecture (§4.3)** — Temporal keeps an event history; state is replayed from events. You get debugging, reproducibility, and auditing without building it.

### 2.2 What Temporal already provides for AI

- Long-running workflows (hours or days; Continue-As-New for very long runs).
- AI integrations (Vercel AI SDK, OpenAI Agents SDK), plus AI cookbook and tutorials.
- Production usage at Replit, Retool, Gorgias; OpenAI uses it for Codex.

### 2.3 What you add on top (don't modify Temporal)

- **AI-native API** — `ctx.model()`, `ctx.tool()`, `agent()` instead of raw activity handles.
- **Model routing** — choose model by latency, cost, complexity, environment.
- **Cost tracking** — every model call metered with tokens and cost (built into model activity).
- **Evaluation pipeline** — production outputs → dataset → scoring → prompt comparison.
- **AI observability** — token usage, cost per execution, model error rates, tool failure rates.
- **Edge execution** — workers in edge/cloud; routing policy per task queue.

---

## 3. When modifying Temporal might (rarely) make sense

Consider a fork or deep customization only if:

- You need fundamentally different durability or replay semantics.
- You need very different scaling or deployment constraints that Temporal's extension points cannot address.
- You are willing to maintain a fork of a large, critical codebase and keep up with upstream.

For the scope in idea.md, none of these are required. **Stick with "build on top."**

---

## 4. Implementation plan (phased)

### Phase 1 — Core workflow runtime (DONE)

**Goal:** Minimal durable workflow execution using Temporal, plus API and one task queue.

**Status: Complete.** Temporal server runs via docker-compose-dev.yml. Fastify API starts Echo workflows. Worker runs the Echo workflow and activity. Event history visible.

---

### Phase 1.5 — SDK design (design phase, no code yet)

**Goal:** Resolve the critical design decisions before writing the AI SDK.

This is the most important phase for the company. A wrong abstraction here means developers either don't adopt (too low-level) or can't control their apps (too magical).

**Deliverables:**

1. **SDK design document** (`SDK-DESIGN.md`)
   - Primary abstraction: hybrid (both explicit workflows and autonomous agents)
   - Developer surface: what developers write, what they never see
   - How Temporal is hidden: mapping from AI primitives to Temporal internals
   - Competitive differentiation vs Temporal raw, Runboard, inference.sh, Kruxia Flow
   - Cost tracking architecture (built-in, not bolted on)

2. **API surface review**
   - Exact TypeScript signatures for `workflow()`, `agent()`, `ctx.model()`, `ctx.tool()`
   - Provider abstraction (model registry, multi-provider support)
   - Tool registration pattern
   - Agent loop design (how a durable agent runs observe-reason-act)

**Exit criteria:** SDK-DESIGN.md reviewed and approved before any Phase 2 code is written.

---

### Phase 2 — AI SDK implementation

**Goal:** Developers write AI workflows and agents using our SDK. No Temporal concepts visible.

**Deliverables:**

1. **Workflow primitive** — `workflow("name", async (ctx) => { ... })` with `ctx.model()` and `ctx.tool()`. Under the hood: Temporal workflow + proxyActivities. Developer never imports from `@temporalio/*`.

2. **Agent primitive** — `agent("name", { model, tools, instructions })` that runs a durable observe-reason-act loop. Runtime manages the loop; developer defines capabilities.

3. **Model abstraction with cost tracking** — Model registry (model id → provider + model name). Every model call returns `{ result, usage: { tokens, cost } }`. Cost data flows to observability from day one.

4. **Tool system** — Tool registry with typed inputs/outputs. Tools are plain async functions registered by name. At least 3 example tools.

5. **Provider abstraction** — At least two providers (e.g. OpenAI + Anthropic) behind a unified interface. Adding a provider = implementing one adapter.

6. **Example: customer-support workflow** — Intent classification → branch → tool call → model response. Runs end-to-end.

7. **Example: durable agent** — A support agent that uses tools autonomously, survives crashes, and resumes. Demonstrates the agent primitive.

**Exit criteria:** Both examples run. Developer code contains zero Temporal imports. Cost data is captured per model call.

---

### Phase 3 — Observability and cost visibility

**Goal:** Production-ready visibility. Cost tracking data from Phase 2 flows into dashboards.

**Deliverables:**

1. **Execution traces** — Trace per workflow/agent run (span per model call, tool call). OpenTelemetry.
2. **Metrics** — Workflow/agent: start rate, completion, duration, failure. AI-specific: token usage, cost per run, model error rates.
3. **Cost dashboard** — Cost per workflow, per model, per time period. The feature Kruxia Flow markets but we bake in.
4. **Budget controls** — Optional soft/hard cost limits per workflow or agent run.

**Exit criteria:** Every run traceable; cost dashboard shows spend by workflow/model.

---

### Phase 4 — Evaluation system

**Goal:** Turn production runs into evaluation datasets and scores.

**Deliverables:**

1. **Capture production outputs** — Write inputs/outputs to evaluation store (DB or object store).
2. **Evaluation dataset** — Pipeline that builds versioned datasets from captured runs.
3. **Automated scoring** — Runner over a dataset; simple rules or LLM-as-judge.
4. **Prompt/model comparison** — A/B or multi-variant: same dataset, different configs; compare scores.

**Exit criteria:** Production runs captured; one dataset scored; two variants compared.

---

### Phase 5 — Model routing, edge, and deployment model

**Goal:** Smarter model selection, optional edge deployment, and monetization strategy.

**Deliverables:**

1. **Model routing** — Router that chooses model by latency SLO, cost budget, complexity hint. Config + logic before calling model activity. Multiple task queues per model tier.
2. **Edge execution** — Workers in edge regions; separate task queues for edge vs cloud. Routing rules by region or device.
3. **Deployment model decision** — Open-source runtime + managed cloud control plane (hybrid model). Define what is open-source vs what is the paid control plane (dashboard, eval, routing policies).

**Exit criteria:** Two model tiers selectable by policy; deployment model documented and ready for early customers.

---

## 5. Architecture: runtime on Temporal

```
┌─────────────────────────────────────────────────────────────────┐
│  Developer                                                       │
│  workflow("support", ...)  or  agent("helper", { ... })          │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│  AI Runtime SDK (your code)                                      │
│  - workflow(), agent(), ctx.model(), ctx.tool()                  │
│  - model registry, tool registry, provider adapters              │
│  - cost tracking per call                                        │
│  - Temporal concepts completely hidden                            │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│  AI Runtime API (your service)                                   │
│  - Start / signal / query workflows and agents                   │
│  - Wraps Temporal client                                         │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│  Temporal (unchanged)                                            │
│  - Workflow engine, event history, task queues                    │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│  Workers (your code)                                             │
│  - Model activity (inference, cost metering)                     │
│  - Tool activity (tool execution)                                │
│  - Agent loop activity (observe-reason-act)                      │
│  - Optional: eval worker, retrieval worker                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Technology choices

- **Language:** TypeScript (Node.js).
- **Workflow engine:** Temporal (server: Docker or Temporal Cloud; SDK: `@temporalio/*`).
- **Runtime API:** Fastify.
- **Workers:** TypeScript; long-lived processes.
- **Observability:** OpenTelemetry + Prometheus/Grafana.
- **Evaluation store:** PostgreSQL or object store.

---

## 7. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Temporal's learning curve | Developers never see Temporal; your SDK abstracts it completely. |
| Vendor lock-in to Temporal | Keep workflow definitions in your SDK; activities are plain functions. Swapping engine later = new execution layer, not rewrite of business logic. |
| Event history size (50k/50MB limit) | Continue-As-New for long-lived or high-event workflows; document in developer guide. |
| "Why not just use Temporal directly?" | SDK must feel like a fundamentally different abstraction. Agents, models, tools — not workflows and activities. See `SDK-DESIGN.md`. |
| Competitors already exist | Differentiate on TypeScript-first, provider-agnostic, invisible infrastructure, hybrid abstraction (workflows + agents). |
| Temporal adds AI features | Temporal is a general workflow engine; adding deep AI abstractions conflicts with their core positioning. Our specialization is the moat. |

---

## 8. Success criteria

- Developers can build an AI workflow using only `workflow()`, `ctx.model()`, and `ctx.tool()` (Phase 2).
- Developers can define a durable agent using `agent()` that survives crashes (Phase 2).
- Zero `@temporalio/*` imports in developer code (Phase 2).
- Every run is observable with cost data (Phase 3).
- Production runs can be turned into evaluation datasets and compared (Phase 4).
- Platform has a clear open-source + managed deployment model (Phase 5).

---

## 9. Next steps

1. **Phase 1.5:** Review and finalize `SDK-DESIGN.md` (the critical design doc).
2. **Phase 2:** Implement the SDK per the design doc. Build both examples (workflow + agent).
3. **Phase 3:** Wire up observability and cost dashboards from the metering built into Phase 2.
