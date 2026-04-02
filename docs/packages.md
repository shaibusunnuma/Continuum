# Packages

Durion publishes scoped npm packages. Install only what you need.

## `@durion/sdk`

**Core runtime:** `workflow()`, `agent()`, `graph()`, `createRuntime()`, `createWorker()`, `createClient()`, `createApp()`, observability helpers, streaming helpers (`LocalStreamBus`, `RedisStreamBus`, `pipeStreamToResponse`).

```bash
npm install @durion/sdk
```

**Peer / companion installs (your choice of providers):**

- **`zod`** — tool schemas and validation (required for typical tool definitions).
- **`@ai-sdk/openai`**, **`@ai-sdk/anthropic`**, **`@ai-sdk/google`**, etc. — construct **`LanguageModel`** instances passed into `createRuntime({ models: { … } })`.

Temporal client/worker libraries are **dependencies** of the SDK; you should not need to add `@temporalio/*` for normal usage unless you have advanced scenarios.

**Workflow entry:** use **`@durion/sdk/workflow`** in files Temporal bundles (narrower surface, no worker code).

## `@durion/react`

**React hooks** for polling stream state and consuming **Gateway v0** token SSE (`useRunStream`, `useGatewayStreamState`, etc.).

```bash
npm install @durion/react
```

**Peer dependency:** `react` ^18 or ^19.

**Peer dependency:** `@durion/sdk` — required for **TypeScript types** (e.g. `StreamState`) in public hook signatures. At runtime, hooks mostly talk to your HTTP API; you still install `@durion/sdk` in the app for types and for any server-side code.

## `@durion/eval`

**Optional** evaluation capture: hooks into the SDK lifecycle to record runs to Postgres and run metrics.

```bash
npm install @durion/eval
```

**Dependency:** `@durion/sdk` (declared in package).

You must provision Postgres and the eval schema. See scripts and comments in the monorepo’s `packages/eval` and [Environment variables](environment-variables.md).

## Monorepo-only workspaces

The GitHub repo also contains **`studio-server`** (Durion Studio Fastify gateway), **`examples/hitl-gateway`** (full Gateway v0 for the HITL UI demo), and **`examples/*`** (sample workers). Those are **not** published to npm as part of the core SDK release; copy patterns from them into your own services.

## Versioning

During **`0.x`**, minor bumps may include breaking changes. Track [CHANGELOG](../CHANGELOG.md) when upgrading.
