# Why Durion?

This page is for teams who already know **Temporal**, the **Vercel AI SDK**, or both, and want a clear picture of **what Durion adds** and **when it is worth taking on as a dependency**.

Durion is **not** a replacement for Temporal or for the Vercel AI SDK. It is an **opinionated runtime and developer surface** on top of them.

## What Durion optimizes for

1. **Durable multi-step AI** — Long-running or fragile processes where you want **each model or tool call** to be a persisted step, not one big in-memory call chain.
2. **Two first-class patterns** — **`workflow()`** for explicit pipelines and **`agent()`** for model-driven tool loops with **step and cost limits**.
3. **Product-style ergonomics** — A single context API (`ctx.model`, `ctx.tool`, `ctx.waitForInput`, `ctx.run`) instead of wiring `proxyActivities`, signals, and queries yourself for the common case.
4. **Operational hooks** — Optional **OpenTelemetry**-style tracing/metrics patterns, optional **evaluation capture** (`@durion/eval`), and a documented **Gateway v0** shape for browsers/BFFs.
5. **Streaming UX (optional)** — Token deltas over an **out-of-band** channel (`StreamBus` + SSE) while the **authoritative result** still completes through Temporal activities (so workflow history is not flooded per token).

## Comparison (high level)

| Dimension | **Durion** | **Vercel AI SDK only** | **Temporal + AI SDK (DIY)** | **`@temporalio/ai-sdk`** (Temporal) |
|-----------|------------|-------------------------|-------------------------------|--------------------------------------|
| **Primary goal** | Durable **workflows** and **agents** with a small API | Single-process LLM calls, streaming, tools | Full flexibility: you design everything | Official bridge: run AI SDK calls **as activities** |
| **Where code runs** | Temporal workers | Your server / serverless function | Temporal (your layout) | Temporal activities |
| **Survives process crash mid-run** | Yes, at activity boundaries | No (unless you add your own store) | Yes, if you built it that way | Yes, for wrapped calls |
| **Developer surface** | `workflow` / `agent` / `ctx.*` | `generateText`, `streamText`, etc. | Workflows, activities, signals, queries, etc. | Activities + AI SDK inside them |
| **Agent loop + tool durability** | Built-in pattern | In-process; one failure can lose the run | You implement scheduling + history | You still design workflow structure |
| **Cost / budget helpers** | Agent **`budgetLimit`**, usage on results | Token usage; USD/budget is yours | Yours to implement | Yours to implement |
| **Gateway + React polling/SSE** | Documented v0 API + `@durion/react` | N/A (you build HTTP) | Yours to build | Yours to build |

The **`@temporalio/ai-sdk`** package is aimed at teams that want a **supported way to call the Vercel AI SDK from Temporal activities** while respecting workflow sandbox rules. Durion goes further into **product semantics**: higher-level primitives, optional streaming integration, eval plugin, and a narrower API for app authors who do not want to own all Temporal wiring.

## When Durion is a good fit

- You are already committed (or willing to commit) to **Temporal** for reliability and scaling of long-running work.
- You want **agents** and **pipelines** with **durable tool execution** without writing your own orchestration loop each time.
- You want **consistent patterns** for HITL, progressive UI (query + optional SSE), and optional **eval capture**.

## When Durion is probably not the right fit

- **Single-request** chat or completion in one HTTP handler with no need for cross-step durability.
- You need **full control** of every Temporal primitive and are happy maintaining that layer indefinitely (Durion’s abstractions may feel constraining).
- You only need **one AI SDK call inside an activity** and already have workflows — **`@temporalio/ai-sdk`** may be sufficient without a higher-level SDK.

## Relationship to dependencies

- **Temporal** executes workflows and activities and stores history.
- **Vercel AI SDK** (and provider packages like `@ai-sdk/openai`) perform the actual LLM requests inside Durion’s activities.
- You **bring** the provider packages you need; Durion does not hide that you are using standard AI SDK models.

If you are unsure, prototype the smallest **workflow + one tool** in Durion and the same in raw Temporal; the difference is mostly **how much glue you write and maintain**.
