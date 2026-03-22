# @durion/sdk

Durable AI workflows and autonomous agents on Temporal.

This SDK provides the execution runtime around the Vercel AI SDK — adding durability, cost control, observability, and a higher-level developer surface.

## Features

- **Durable execution**: If a process crashes, the run replays from the last completed step instead of losing the LLM interaction.
- **Provider-agnostic**: Uses the Vercel AI SDK under the hood (`generateText`, `streamText`).
- **Declarative Agents & Workflows**: Use `agent()` for autonomous loops or `workflow()` for deterministic pipelines.
- **Budget enforcement**: Set `maxCostUsd` on an agent loop.
- **Human-in-the-loop**: Built-in `ctx.waitForInput()` to pause and resume durably.

## Installation

```bash
npm install @durion/sdk
```

## Setup & Environment

The SDK loads configuration at runtime but relies on standard Temporal environment variables.
Ensure you have the following if using standard paths or a hosted Temporal instance:

- `TEMPORAL_ADDRESS`
- `TEMPORAL_NAMESPACE`

> Note: If integrating in an app, load your `.env` at the *entrypoint* or in the application scope. The SDK does not automatically resolve an app-level `.env` when installed inside `node_modules`.

## Usage

```typescript
import { agent } from '@durion/sdk';

export const supportAgent = agent('support-agent', {
  model: 'gpt-4o',
  instructions: 'You are a helpful customer support assistant.',
  tools: ['search-knowledge-base', 'get-order-status'],
  maxSteps: 10,
  budgetLimit: {
    maxCostUsd: 0.50
  }
});
```

For more details on the Runtime Gateway and hooks, check out `@durion/react`.
