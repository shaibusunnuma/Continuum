# @durion/react

## 0.2.1

### Patch Changes

- Updated dependencies [a6f898f]
  - @durion/sdk@0.2.0

## 0.2.0

### Minor Changes

- 4ec1ff1: Rename Gateway-related public exports to drop `V0` from identifiers (for example `useGatewayTokenStream`, `useGatewayStreamState`, `gatewaySignalUrl`, `createGatewayStreamStateQueryFn`). Behavior is unchanged; URLs still target Gateway API v0 (`/v0/...`). Documented in `docs/gateway-api-v0.md` and package README.

## 0.1.0

### Minor Changes

- 5fa71df: First public release (0.1.x) — durable AI workflows and agents on Temporal (workflow, agent, Gateway-oriented React hooks, optional eval capture)

### Patch Changes

- Updated dependencies [5fa71df]
  - @durion/sdk@1.0.0
