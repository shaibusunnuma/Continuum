/**
 * SdkClient — typed wrapper around @temporalio/client for starting and
 * interacting with SDK workflows and agents.
 *
 * Usage (type-safe — preferred):
 *   import { myWorkflow } from './workflows';
 *   const client = await createClient({ taskQueue: 'ai-runtime' });
 *   const handle = await client.start(myWorkflow, { input: { message: 'Hi' } });
 *   const result = await handle.result();
 *
 * Usage (string-based — for REST bridges / dynamic types):
 *   const handle = await client.startWorkflow('myWorkflow', { input: { message: 'Hi' } });
 */
import { Client, Connection, WorkflowExecutionDescription } from '@temporalio/client';
import { config } from '../../shared/config';
import { ConfigurationError } from '../errors';
import type { StreamState } from '../types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Configuration for `createClient()`. All fields are optional and default to env/config values.
 */
export interface CreateClientConfig {
  /** Temporal server address (e.g. 'localhost:7233'). Defaults to TEMPORAL_ADDRESS env. */
  temporalAddress?: string;
  /** Temporal namespace. Defaults to TEMPORAL_NAMESPACE env. */
  temporalNamespace?: string;
  /**
   * Default task queue for all workflow starts from this client.
   * Can be overridden per call via `options.taskQueue`.
   * Falls back to TASK_QUEUE env / 'ai-runtime' if omitted.
   */
  taskQueue?: string;
}

/** Options for starting a workflow. */
export interface StartWorkflowOptions<TInput = unknown> {
  /** Input to the workflow/agent function. */
  input: TInput;
  /**
   * Task queue override for this specific start.
   * Precedence: options.taskQueue > createClient({ taskQueue }) > TASK_QUEUE env > 'ai-runtime'.
   */
  taskQueue?: string;
  /** Optional workflow ID for idempotency. Auto-generated if omitted. */
  workflowId?: string;
}

/** A handle to a running or completed workflow. */
export interface WorkflowRun<TResult = unknown> {
  /** The Temporal workflow ID. */
  workflowId: string;
  /** Wait for the workflow to complete and return its result. */
  result(): Promise<TResult>;
  /** Query the workflow's current stream state (for progressive UX). */
  queryStreamState(): Promise<StreamState>;
  /** Send a signal to the workflow (e.g. 'ai-runtime:user-input' for HITL). */
  signal(name: string, data: unknown): Promise<void>;
  /** Request cancellation of the workflow. */
  cancel(): Promise<void>;
  /** Get details about the workflow execution (status, etc). */
  describe(): Promise<WorkflowExecutionDescription>;
}

/** The SDK client. Use `createClient()` to create an instance. */
export interface SdkClient {
  /**
   * Start a workflow or agent using a function reference (type-safe).
   * The workflow type is derived from `workflow.name` (set by `workflow()` / `agent()`).
   */
  start<TInput, TResult>(
    workflow: (input: TInput) => Promise<TResult>,
    options: StartWorkflowOptions<TInput>,
  ): Promise<WorkflowRun<TResult>>;

  /**
   * Start a workflow or agent using a string workflow type.
   * Prefer `start(fn, options)` for type safety; use this for REST bridges or dynamic types.
   */
  startWorkflow<TInput = unknown, TResult = unknown>(
    workflowType: string,
    options: StartWorkflowOptions<TInput>,
  ): Promise<WorkflowRun<TResult>>;

  /** Get a handle to an existing workflow by ID. */
  getWorkflowHandle<TResult = unknown>(workflowId: string): WorkflowRun<TResult>;
  /** Close the underlying Temporal connection. */
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive the Temporal workflow type string from a workflow/agent function reference.
 * `workflow()` and `agent()` set `Object.defineProperty(fn, 'name', { value })`,
 * so `fn.name` is the exact string Temporal registers as the workflow type.
 */
export function resolveWorkflowType(fn: (...args: any[]) => any): string {
  const name = fn.name;
  if (!name || typeof name !== 'string' || name.trim() === '') {
    throw new ConfigurationError(
      'Cannot derive workflow type: function has no name. ' +
      'Use workflow() or agent() to define it, or call startWorkflow(string, ...) instead.',
    );
  }
  return name;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Creates an SDK client connected to the Temporal server.
 * @param cfg - Optional address/namespace/taskQueue overrides
 * @returns An SdkClient for starting workflows and querying state
 */
export async function createClient(cfg?: CreateClientConfig): Promise<SdkClient> {
  const address = cfg?.temporalAddress ?? config.TEMPORAL_ADDRESS;
  const namespace = cfg?.temporalNamespace ?? config.TEMPORAL_NAMESPACE;
  const defaultTaskQueue = cfg?.taskQueue;

  const connection = await Connection.connect({ address });
  const temporalClient = new Client({ connection, namespace });

  function resolveTaskQueue(perCall?: string): string {
    return perCall ?? defaultTaskQueue ?? config.TASK_QUEUE;
  }

  function wrapHandle<TResult>(handle: { workflowId: string; result(): Promise<any>; query<T>(name: string): Promise<T>; signal(name: string, ...args: any[]): Promise<void>; cancel(): Promise<any>; describe(): Promise<WorkflowExecutionDescription> }): WorkflowRun<TResult> {
    return {
      workflowId: handle.workflowId,
      async result(): Promise<TResult> {
        return handle.result() as Promise<TResult>;
      },
      async queryStreamState(): Promise<StreamState> {
        return handle.query<StreamState>('ai-runtime:streamState');
      },
      async signal(name: string, data: unknown): Promise<void> {
        await handle.signal(name, data);
      },
      async cancel(): Promise<void> {
        await handle.cancel();
      },
      async describe(): Promise<WorkflowExecutionDescription> {
        return handle.describe();
      },
    };
  }

  return {
    async start<TInput, TResult>(
      workflow: (input: TInput) => Promise<TResult>,
      options: StartWorkflowOptions<TInput>,
    ): Promise<WorkflowRun<TResult>> {
      const workflowType = resolveWorkflowType(workflow);
      const taskQueue = resolveTaskQueue(options.taskQueue);
      const workflowId = options.workflowId ?? `${workflowType}-${crypto.randomUUID()}`;
      const handle = await temporalClient.workflow.start(workflowType, {
        args: [options.input],
        taskQueue,
        workflowId,
      });
      return wrapHandle<TResult>(handle);
    },

    async startWorkflow<TInput, TResult>(
      workflowType: string,
      options: StartWorkflowOptions<TInput>,
    ): Promise<WorkflowRun<TResult>> {
      const taskQueue = resolveTaskQueue(options.taskQueue);
      const workflowId = options.workflowId ?? `${workflowType}-${crypto.randomUUID()}`;
      const handle = await temporalClient.workflow.start(workflowType, {
        args: [options.input],
        taskQueue,
        workflowId,
      });
      return wrapHandle<TResult>(handle);
    },

    getWorkflowHandle<TResult>(workflowId: string): WorkflowRun<TResult> {
      const handle = temporalClient.workflow.getHandle(workflowId);
      return wrapHandle<TResult>(handle);
    },

    async close(): Promise<void> {
      await connection.close();
    },
  };
}
