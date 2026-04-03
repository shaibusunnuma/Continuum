# Changelog

All notable changes to the Durion project will be documented in this file.

## [v0.3.0] - 2026-03-29

### Added

- **`@durion/cli`** (first publish): `durion dev` (Temporal dev server + watched worker + built-in Fastify gateway + Studio), `durion doctor`, `durion studio`; `defineConfig()` / `durion.config.ts`; built-in Gateway v0 for Studio (runs list, history, spans proxy, minimal `/v0/runs/*`, OTLP `POST /v1/traces`); labeled process output and graceful shutdown; persistent Temporal dev DB under `.durion/temporal.db`.
- **`create-durion`** (first publish): `npx create-durion [name]` — interactive scaffolder with templates **`hello`**, **`agent`**, **`blank`**; OpenAI, Anthropic, Google; `--default` for non-interactive setup; Temporal CLI detection with install hints; package manager detection (npm, pnpm, yarn, bun).

### Changed

- **`@durion/sdk`** (minor): Table-based **`createTableCostCalculator`**, **`EXAMPLE_PRICING_ROWS`**, **`resolvePricingRow`**, **`pricingProviderMatches`**, **`normalizeCostCalculationResult`**; **`Usage.costAttribution`** and related types on model results; **`RunModelResult.modelId`** (registry id); Temporal Cloud / TLS env alignment; workflow memo upsert **`durion:usage`** for Studio list metadata.
- **`@durion/react`** (patch): Dependency range aligned with **`@durion/sdk` ^0.3.0**.
- **`@durion/eval`** (patch): Dependency range aligned with **`@durion/sdk` ^0.3.0**.

### Note

**`@durion/studio`** and **`studio-server`** remain monorepo-only (not published). See [docs/releasing.md](docs/releasing.md) for how maintainers cut npm releases.

## [v0.1.0] - 2026-03-22

### Added

- **@durion/sdk**: Initial preview release of the Durion SDK.
  - `workflow()` and `agent()` primitives for durable execution on Temporal.
  - Integration with Vercel AI SDK for provider-agnostic LLM calls.
  - Built-in cost calculation and budget limits.
  - Human-in-the-loop support via `ctx.waitForInput()`.
  - Tool and Model registries.
- **@durion/eval**: Initial evaluation library for tracking model changes and quality regressions.
- **@durion/react**: Hooks for fetching SSE tokens and polled UX state from the Gateway API.

### Note on "Experimental" 0.x Status
During the `0.x` series, the APIs for the Gateway, SDK surfaces (`ctx.model`, `ctx.tool`), and React hooks are considered **experimental**. This means breaking changes may occur between minor versions (`0.1.x` to `0.2.x`) as we refine the abstractions based on early adopter feedback.
