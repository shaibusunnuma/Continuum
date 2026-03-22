# Changelog

All notable changes to the Durion project will be documented in this file.

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
