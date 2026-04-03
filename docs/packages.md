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

## `create-durion`

**Project scaffolder** (standalone npm package, not under the `@durion/` scope):

```bash
npx create-durion@latest my-app
```

Interactive prompts for template (**`hello`**, **`agent`**, **`blank`**), LLM provider (OpenAI, Anthropic, Google), and API key. Flags: **`--template`**, **`--llm`**, **`--llm-api-key`**, **`--default`** (non-interactive defaults), **`--no-install`**. See [create-durion README](../create-durion/README.md).

## `@durion/cli`

**Local dev orchestration** and **built-in Studio gateway**:

```bash
npm install @durion/cli
npx durion dev
npx durion doctor
npx durion studio
```

**`durion dev`** starts Temporal (optional embedded dev server), the worker (watch), Fastify gateway (Gateway v0 subset for Studio + OTLP), and Studio UI, driven by **`durion.config.ts`** and **`defineConfig()`** from **`@durion/cli`**. See [CLI README](../packages/cli/README.md) and [Gateway API v0](gateway-api-v0.md).

## `@durion/studio` (monorepo only)

The **Durion Studio** Vite app lives in **`packages/studio`** with **`private: true`**. It is **not** published to npm. **`durion studio`** / **`durion dev`** resolve Studio’s **`durion-studio`** bin from **`node_modules/@durion/studio`** (if you add a **file:** or git dependency) or from adjacent paths when developing inside this repository. For day-to-day monorepo work, use **`npm run studio:dev`** at the repo root.

## Monorepo-only workspaces

The GitHub repo also contains **`studio-server`** (Durion Studio Fastify gateway), **`examples/hitl-gateway`** (full Gateway v0 for the HITL UI demo), and **`examples/*`** (sample workers). Those are **not** published to npm as part of the core SDK release; copy patterns from them into your own services.

## Versioning

During **`0.x`**, minor bumps may include breaking changes. Track [CHANGELOG](../CHANGELOG.md) when upgrading.
