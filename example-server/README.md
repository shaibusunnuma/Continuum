# Example server

Reference REST API server for the AI Runtime. Not part of the SDK — it’s a sample app that shows how to start workflows and agents via HTTP using `@ai-runtime/sdk` and `@temporalio/client`.

- **POST /workflows/start** — start a workflow by type and input
- **POST /agents/start** — start an agent by name and input
- **GET /runs/:workflowId** — run status
- **GET /runs/:workflowId/result** — run result (or 202 while running)

Run from repo root: `npm run api` (built) or `npm run api:dev` (ts-node). Requires Temporal and env (e.g. `TEMPORAL_ADDRESS`, `API_PORT`).
