---
name: temporal-developer
description: This skill should be used when working with Temporal concepts in the Durion SDK — including workflow determinism, activity patterns, signals, queries, updates, error handling, testing, troubleshooting, and AI/LLM integration patterns on Temporal.
version: 0.3.0
---

# Skill: temporal-developer

## Overview

Temporal is a durable execution platform that makes workflows survive failures automatically. This skill provides guidance for building Temporal applications in TypeScript, which is the language used by the Durion SDK.

## Core Architecture

The **Temporal Cluster** is the central orchestration backend. It maintains three key subsystems: the **Event History** (a durable log of all workflow state), **Task Queues** (which route work to the right workers), and a **Visibility** store (for searching and listing workflows). There are three ways to run a Cluster:

- **Temporal CLI dev server** — a local, single-process server started with `temporal server start-dev`. Suitable for development and testing only, not production.
- **Self-hosted** — you deploy and manage the Temporal server and its dependencies (e.g., database) in your own infrastructure for production use.
- **Temporal Cloud** — a fully managed production service operated by Temporal. No cluster infrastructure to manage.

**Workers** are long-running processes that you run and manage. They poll Task Queues for work and execute your code. Each Worker hosts two types of code:

- **Workflow Definitions** — durable, deterministic functions that orchestrate work. These must not have side effects.
- **Activity Implementations** — non-deterministic operations (API calls, file I/O, etc.) that can fail and be retried.

Workers communicate with the Cluster via a poll/complete loop: they poll a Task Queue for tasks, execute the corresponding Workflow or Activity code, and report results back.

## History Replay: Why Determinism Matters

Temporal achieves durability through **history replay**:

1. **Initial Execution** - Worker runs workflow, generates Commands, stored as Events in history
2. **Recovery** - On restart/failure, Worker re-executes workflow from beginning
3. **Matching** - SDK compares generated Commands against stored Events
4. **Restoration** - Uses stored Activity results instead of re-executing

**If Commands don't match Events = Non-determinism Error = Workflow blocked**

| Workflow Code | Command | Event |
|--------------|---------|-------|
| Execute activity | `ScheduleActivityTask` | `ActivityTaskScheduled` |
| Sleep/timer | `StartTimer` | `TimerStarted` |
| Child workflow | `StartChildWorkflowExecution` | `ChildWorkflowExecutionStarted` |

See `references/core/determinism.md` for detailed explanation.

## Getting Started

### Read All Relevant References

1. First, read the TypeScript getting started guide: `references/typescript/typescript.md`
2. Second, read appropriate `core` and `typescript` references for the task at hand.

## Primary References
- **`references/core/determinism.md`** - Why determinism matters, replay mechanics, basic concepts of activities
    + TypeScript-specific info at `references/typescript/determinism.md`
- **`references/core/patterns.md`** - Conceptual patterns (signals, queries, saga)
    + TypeScript-specific info at `references/typescript/patterns.md`
- **`references/core/gotchas.md`** - Anti-patterns and common mistakes
    + TypeScript-specific info at `references/typescript/gotchas.md`
- **`references/core/troubleshooting.md`** - Decision trees, recovery procedures
- **`references/core/error-reference.md`** - Common error types, workflow status reference
- **`references/core/interactive-workflows.md`** - Testing signals, updates, queries
- **`references/core/ai-patterns.md`** - AI/LLM integration patterns on Temporal

## TypeScript-Specific References
- **`references/typescript/typescript.md`** - Getting started, key concepts, file organization
- **`references/typescript/determinism.md`** - Essentials of determinism in TypeScript
- **`references/typescript/determinism-protection.md`** - V8 sandbox and bundling
- **`references/typescript/patterns.md`** - Signals, queries, child workflows, saga pattern
- **`references/typescript/gotchas.md`** - TypeScript-specific mistakes and anti-patterns
- **`references/typescript/error-handling.md`** - ApplicationFailure, retry policies, non-retryable errors
- **`references/typescript/observability.md`** - Logging, metrics, tracing
- **`references/typescript/testing.md`** - TestWorkflowEnvironment, time-skipping, activity mocking
