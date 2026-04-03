---
"@durion/sdk": minor
"@durion/cli": minor
"create-durion": minor
"@durion/react": patch
"@durion/eval": patch
---

### @durion/sdk

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
