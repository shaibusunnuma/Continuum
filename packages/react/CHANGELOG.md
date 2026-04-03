# @durion/react

## 0.2.2

### Patch Changes

- 772fdbe: ### @durion/sdk

  - Cost / pricing: `createTableCostCalculator`, `EXAMPLE_PRICING_ROWS`, `resolvePricingRow`, `pricingProviderMatches`, `normalizeCostCalculationResult`; `Usage.costAttribution` on model results; optional `costCalculator` on calls.
  - `RunModelResult.modelId` (registry id) on activity results.
  - Temporal Cloud / TLS env alignment; `createClient` / worker connection merge.
  - Workflow memo upsert `durion:usage` for Studio run list metadata.

  ### @durion/cli

  - First publish: `durion dev`, `durion doctor`, `durion studio`; `defineConfig()` / `durion.config.ts`; built-in Gateway v0 + OTLP ingestion for Studio; Temporal dev server management.

  ### create-durion

  - First publish: `npx create-durion` interactive scaffolder; templates `hello`, `agent`, `blank`; OpenAI, Anthropic, Google; `--default`, `--no-install`, and non-interactive template/LLM flags.

  ### @durion/react

  - Bump `@durion/sdk` dependency range to ^0.3.0.

  ### @durion/eval

  - Bump `@durion/sdk` dependency range to ^0.3.0.

- Updated dependencies [772fdbe]
  - @durion/sdk@0.3.0

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
