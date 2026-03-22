# Durion documentation

**Durion** is a TypeScript SDK for **durable AI workflows and agents** on [Temporal](https://temporal.io/), built on the [Vercel AI SDK](https://ai-sdk.dev/) for model calls. You write `workflow()` and `agent()` with `ctx.model()` and `ctx.tool()`; the runtime turns them into replay-safe executions that survive process restarts.

**Status:** The `0.x` releases are **experimental**. APIs may change; see the [CHANGELOG](../CHANGELOG.md) for release notes.

---

## Start here

| Time | Path |
|------|------|
| **~5 minutes** | [Getting started](getting-started.md) — install, run Temporal, minimal worker + one workflow |
| **~30 minutes** | [Concepts](concepts.md) + [Packages](packages.md) + run an [example worker](../examples/README.md) from the monorepo |

---

## Guides

- [Getting started](getting-started.md) — first project: `workflows.ts`, worker, optional `createClient`
- [Concepts](concepts.md) — workflows vs agents, durability, task queues, HITL, stream state
- [Why Durion?](why-durion.md) — compared to Vercel AI SDK alone, DIY Temporal, and `@temporalio/ai-sdk`
- [Packages](packages.md) — `@durion/sdk`, `@durion/react`, `@durion/eval` and when to use each
- [Environment variables](environment-variables.md) — `TEMPORAL_*`, `TASK_QUEUE`, `DURION_*`, Redis
- [Streaming](streaming.md) — token streaming, `StreamBus`, subscribe-before-start, gateway SSE
- [Troubleshooting](troubleshooting.md) — common mistakes and fixes

## Reference

- [Gateway API v0](gateway-api-v0.md) — HTTP routes for browsers and BFFs (`/v0/runs/...`, `/v0/workflows/...`)

## Maintainers

- [Releasing](releasing.md) — Changesets, Version PRs, npm publish from CI

## Repository pointers

- [Main README](../README.md) — overview, scripts, observability
- [Examples README](../examples/README.md) — runnable workers in this repo
- [Example HTTP server](../example-server/README.md) — reference gateway implementation
