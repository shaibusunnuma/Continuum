# HITL demo gateway (Gateway v0)

Standalone Fastify app for **[examples/react-hitl-ui](../react-hitl-ui/README.md)** only: **`POST /v0/workflows/start`**, run describe / stream-state / result, **token SSE**, and **signals**. Durion Studio uses **`studio-server`** on port **3000** instead.

## Env

- **`HITL_GATEWAY_PORT`** — listen port (default **3001**).
- **`TEMPORAL_*`**, **`TASK_QUEUE`**, **`REDIS_URL`** — same as the HITL worker and [Gateway API v0](../../docs/gateway-api-v0.md).
- **`DURION_GATEWAY_TOKEN`** (optional) — same auth rules as the full v0 spec.

Loads **`.env`** from the monorepo root (`../../..` from `src/config.ts`) and from the current working directory.

## Run

This package is **not** in the root **`workspaces`** list. Install dependencies here once (after a root `npm install` so `packages/sdk` is built):

```bash
cd examples/hitl-gateway && npm install
```

From the monorepo root:

```bash
npm run hitl-gateway:dev
```

Or from **`examples/`**:

```bash
npm run server:hitl-gateway
```

Or from this directory: **`npm run dev`**
