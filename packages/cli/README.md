# @durion/cli

Durion **command-line tools**: run the local dev stack, check prerequisites, and launch **Durion Studio** against a gateway.

## Install

```bash
npm install @durion/cli
```

The **`durion`** binary is provided via the `bin` field (`npx durion` works without a global install).

## Commands

| Command | Description |
|---------|-------------|
| **`durion dev`** | Starts Temporal (optional embedded dev server), the **worker** (`tsx --watch`), the **built-in Fastify gateway** (Gateway v0 routes for Studio + OTLP `POST /v1/traces`), and **Studio** when resolvable. Options: `--no-temporal`, `--no-gateway`, `--no-studio`, `--worker-only`. |
| **`durion doctor`** | Checks Node.js, Temporal CLI, `.env`, and basic reachability. |
| **`durion studio`** | Runs Studio only; **`--port`**, **`--gateway-url`**. Requires **`@durion/studio`** in **`node_modules`** or a monorepo-adjacent path (see [docs/packages.md](../../docs/packages.md)). |

## Config: `durion.config.ts`

Add **`durion.config.ts`** (or `.js` / `.mjs`) at the project root and export your config with **`defineConfig`** from **`@durion/cli`**:

```ts
import { defineConfig } from '@durion/cli';

export default defineConfig({
  workflowsPath: './src/workflows.ts',
  workerPath: './src/worker.ts',
  gateway: { port: 3000 },
  studio: { port: 4173 },
  temporal: { devServer: true, address: 'localhost:7233', namespace: 'default' },
});
```

- **`gateway: false`** — no HTTP gateway.
- **`studio: false`** — no Studio process.
- **`temporal: false`** — do not manage Temporal; still uses **`address`** / **`namespace`** for clients.

If the file is missing, the CLI uses defaults (`./src/workflows.ts`, `./src/worker.ts`, gateway **3000**, Studio **4173**, Temporal dev server on).

## Built-in gateway (Studio)

The dev gateway implements the **Studio** subset of [Gateway API v0](../../docs/gateway-api-v0.md): **`/v0/studio/*`** (runs list, history, spans), minimal **`/v0/runs/*`** (describe, stream-state, result), and **`POST /v1/traces`** for OTLP ingestion. Optional **`DURION_GATEWAY_TOKEN`**: Bearer auth on **`/v0/*`**.

## See also

- [Getting started](../../docs/getting-started.md)
- [Environment variables](../../docs/environment-variables.md)
