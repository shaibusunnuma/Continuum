# @durion/eval

## 0.1.4

### Patch Changes

- dba737b: - **Fix Activity Polling**: Agents can natively pause via the `waitForSignal` Temporal abstraction, saving compute overhead by idling gracefully.
  - **Dynamic Tool Timeouts**: Core SDK `tool()` execution will now dynamically proxy timeouts. You can optionally set per-tool `timeout` limits matching real-world demands instead of the static 5-minute system default.
- Updated dependencies [dba737b]
  - @durion/sdk@0.3.2

## 0.1.3

### Patch Changes

- 8026a28: - **Fix Continue-As-New State Persistence**: `accumulatedCost` and `totalUsage` are now preserved across Continue-As-New boundaries, ensuring budget limits and usage metrics are accurately enforced for long-running Graph workflows.
  - **Fix Error Attribution**: Unhandled execution errors now properly attribute the crash to the failing node name, rather than the last successful node.
- Updated dependencies [8026a28]
  - @durion/sdk@0.3.1

## 0.1.2

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

## 0.1.1

### Patch Changes

- Updated dependencies [a6f898f]
  - @durion/sdk@0.2.0

## 0.1.0

### Minor Changes

- 5fa71df: First public release (0.1.x) — durable AI workflows and agents on Temporal (workflow, agent, Gateway-oriented React hooks, optional eval capture)

### Patch Changes

- Updated dependencies [5fa71df]
  - @durion/sdk@0.1.0
