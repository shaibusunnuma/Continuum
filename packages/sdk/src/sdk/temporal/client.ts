/**
 * SdkClient — typed wrapper around @temporalio/client for starting and
 * interacting with SDK workflows and agents.
 *
 * Usage:
 *   const client = await createClient();
 *   const run = await client.startWorkflow('customerSupport', { input: { message: 'Help' } });
 *   const result = await run.result();
 */
import { Client, Connection, WorkflowExecutionDescription } from '@temporalio/client';
import { config } from '../../shared/config';
import type { StreamState } from '../types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Configuration for `createClient()`. All fields are optional and default to env/config values. */
export interface CreateClientConfig {
  /** Temporal server address (e.g. 'localhost:7233'). Defaults to TEMPORAL_ADDRESS env. */
  temporalAddress?: string;
  /** Temporal namespace. Defaults to TEMPORAL_NAMESPACE env. */
  temporalNamespace?: string;
}

/** Options for starting a workflow via `client.startWorkflow()`. */
export interface StartWorkflowOptions<TInput = unknown> {
  /** Input to the workflow/agent function. */
  input: TInput;
  /** Task queue to run on. Defaults to TASK_QUEUE env / 'ai-runtime'. */
  taskQueue?: string;
  /** Optional workflow ID. Temporal will generate one if omitted. */
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
  /** Send a signal to the workflow (e.g. user input via 'user-input' signal). */
  signal(name: string, data: unknown): Promise<void>;
  /** Request cancellation of the workflow. */
  cancel(): Promise<void>;
  /** Get details about the workflow execution (status, etc). */
  describe(): Promise<WorkflowExecutionDescription>;
}

/** The SDK client. Use `createClient()` to create an instance. */
export interface SdkClient {
  /** Start a workflow or agent and return a handle. */
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
// Implementation
// ---------------------------------------------------------------------------

/**
 * Creates an SDK client connected to the Temporal server.
 * @param cfg - Optional address/namespace overrides
 * @returns An SdkClient for starting workflows and querying state
 */
export async function createClient(cfg?: CreateClientConfig): Promise<SdkClient> {
  const address = cfg?.temporalAddress ?? config.TEMPORAL_ADDRESS;
  const namespace = cfg?.temporalNamespace ?? config.TEMPORAL_NAMESPACE;

  const connection = await Connection.connect({ address });
  const temporalClient = new Client({ connection, namespace });

  return {
    async startWorkflow<TInput, TResult>(
      workflowType: string,
      options: StartWorkflowOptions<TInput>,
    ): Promise<WorkflowRun<TResult>> {
      const taskQueue = options.taskQueue ?? config.TASK_QUEUE;
      const workflowId = options.workflowId ?? `${workflowType}-${crypto.randomUUID()}`;
      const handle = await temporalClient.workflow.start(workflowType, {
        args: [options.input],
        taskQueue,
        workflowId,
      });

      return {
        workflowId: handle.workflowId,

        async result(): Promise<TResult> {
          return handle.result() as Promise<TResult>;
        },

        async queryStreamState(): Promise<StreamState> {
          return handle.query<StreamState>('streamState');
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
    },

    getWorkflowHandle<TResult>(workflowId: string): WorkflowRun<TResult> {
      const handle = temporalClient.workflow.getHandle(workflowId);

      return {
        workflowId: handle.workflowId,

        async result(): Promise<TResult> {
          return handle.result() as Promise<TResult>;
        },

        async queryStreamState(): Promise<StreamState> {
          return handle.query<StreamState>('streamState');
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
    },

    async close(): Promise<void> {
      await connection.close();
    },
  };
}
