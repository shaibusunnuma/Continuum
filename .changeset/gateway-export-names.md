---
'@durion/react': minor
---

Rename Gateway-related public exports to drop `V0` from identifiers (for example `useGatewayTokenStream`, `useGatewayStreamState`, `gatewaySignalUrl`, `createGatewayStreamStateQueryFn`). Behavior is unchanged; URLs still target Gateway API v0 (`/v0/...`). Documented in `docs/gateway-api-v0.md` and package README.
