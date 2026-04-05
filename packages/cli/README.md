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
| **`durion dev`** | Starts Temporal (optional embedded dev server), the **worker** (`tsx --watch`), the **built-in Fastify gateway** (Gateway v0 + OTLP `POST /v1/traces`), and serves the **bundled Durion Studio SPA** from the **same port** as the gateway (default `http://localhost:3000/`). **`@durion/studio` is not on npm**; the UI ships inside **`@durion/cli`**. In the **Durion monorepo**, if **`@durion/studio`** is workspace-linked, a separate Vite dev server on **`studio.port`** is used when the gateway is off or bundled assets are missing. Options: `--no-temporal`, `--no-gateway`, `--no-studio`, `--worker-only`. |
| **`durion doctor`** | Checks Node.js, Temporal CLI, `.env`, and basic reachability. |
| **`durion studio`** | **Published CLI:** prints how to open **bundled** Studio via **`durion dev`**. **Monorepo:** with **`@durion/studio`** linked, runs Vite (**`--port`**, **`--gateway-url`**) for HMR while editing Studio. |

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
- **`studio: false`** — do not start a separate Vite Studio process; bundled Studio on the gateway is also omitted from logs (gateway still serves **`/`** if assets are present).
- **`temporal: false`** — do not manage Temporal; still uses **`address`** / **`namespace`** for clients.

If the file is missing, the CLI uses defaults (`./src/workflows.ts`, `./src/worker.ts`, gateway **3000**, Vite port **4173** only when developing Studio from the monorepo with **`@durion/studio`** linked, Temporal dev server on). Bundled Studio is at **`http://localhost:3000/`** with the default gateway port.

## Built-in gateway (Studio)

The dev gateway implements the **Studio** subset of [Gateway API v0](../../docs/gateway-api-v0.md): **`/v0/studio/*`** (runs list, history, spans), minimal **`/v0/runs/*`** (describe, stream-state, result), and **`POST /v1/traces`** for OTLP ingestion. It also serves the **Durion Studio** static UI at **`/`** (same origin as **`/v0`**, so the app uses relative API paths). Optional **`DURION_GATEWAY_TOKEN`**: Bearer auth on **`/v0/*`**.

## See also

- [Getting started](../../docs/getting-started.md)
- [Environment variables](../../docs/environment-variables.md)
