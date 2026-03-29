# @durion/studio

Durion Studio — Run Explorer and live visualization for `workflow()`, `agent()`, and `graph()` against the [Gateway API v0](../../docs/gateway-api-v0.md).

## Prerequisites

- A running gateway (e.g. `example-server`) with Temporal reachable.
- Optional: set `DURION_GATEWAY_TOKEN` on the gateway; then configure the Studio to send the same token.

## Local development

From the monorepo root:

```bash
npm run api:dev
```

In another terminal:

```bash
cd packages/studio && npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`). API requests to `/v0/*` are proxied to `http://127.0.0.1:3000` unless you set `STUDIO_GATEWAY_URL`.

### Environment

| Variable | Purpose |
|----------|---------|
| `STUDIO_GATEWAY_URL` | Proxy target for `/v0` (default `http://127.0.0.1:3000`). |
| `VITE_GATEWAY_TOKEN` | Bearer token for `Authorization` when the gateway requires auth. |

You can also paste a token once in the app via `localStorage` key `durion.gatewayToken` (set from devtools), or rely on `VITE_GATEWAY_TOKEN` in `.env` for local builds.

## CLI

```bash
npx durion-studio
```

Runs `vite dev` for this package (requires dependencies installed).

## Production build

```bash
npm run build
```

Static output is in `dist/`. Serve `dist/` behind the same origin as the gateway, or configure CORS on the gateway for the Studio origin.
