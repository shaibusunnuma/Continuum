/**
 * SdkClient — typed wrapper around @temporalio/client for starting and
 * interacting with SDK workflows and agents.
 *
 * Usage (type-safe — preferred):
 *   import { myWorkflow } from './workflows';
 *   const client = await createClient({ taskQueue: 'my-queue' });
 *   const handle = await client.start(myWorkflow, { input: { message: 'Hi' } });
 *   const result = await handle.result();
 *
 * Usage (string-based — for REST bridges / dynamic types):
 *   const handle = await client.startWorkflow('myWorkflow', { input: { message: 'Hi' } });
 */
import { Client, Connection, WorkflowExecutionDescription } from '@temporalio/client';
import { executionInfoFromRaw } from '@temporalio/client/lib/helpers';
import { historyToJSON } from '@temporalio/common/lib/proto-utils';
import type { LoadedDataConverter } from '@temporalio/common';
import { config } from '../../shared/config';
import { ConfigurationError } from '../errors';
import type { StreamState } from '../types';
import type {
  ListWorkflowExecutionsParams,
  ListWorkflowExecutionsResult,
  StudioRunPrimitive,
  StudioWorkflowExecutionSummary,
} from './studio-types';

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
   * Falls back to TASK_QUEUE env / 'durion' if omitted.
   */
  taskQueue?: string;
}

/** Options for starting a workflow. */
export interface StartWorkflowOptions<TInput = unknown> {
  /** Input to the workflow/agent function. */
  input: TInput;
  /**
   * Task queue override for this specific start.
   * Precedence: options.taskQueue > createClient({ taskQueue }) > TASK_QUEUE env > 'durion'.
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
  /** Send a signal to the workflow (e.g. 'durion:user-input' for HITL). */
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

  /**
   * List workflow executions in this namespace (visibility API).
   * Used by Durion Studio Run Explorer.
   */
  listWorkflowExecutions(params?: ListWorkflowExecutionsParams): Promise<ListWorkflowExecutionsResult>;

  /**
   * Fetch full workflow event history as JSON-safe data (for Studio / debugging).
   */
  fetchWorkflowHistory(workflowId: string, runId?: string): Promise<unknown>;

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

function studioPrimitiveFromMemo(memo: Record<string, unknown>): StudioRunPrimitive | null {
  const p = memo['durion:primitive'];
  if (p === 'graph' || p === 'agent' || p === 'workflow') return p;
  if (memo['durion:topology'] != null) return 'graph';
  return null;
}

function studioUsageFromMemo(memo: Record<string, unknown>): {
  totalTokens: number | null;
  costUsd: number | null;
} {
  const u = memo['durion:usage'];
  if (u === null || u === undefined || typeof u !== 'object' || Array.isArray(u)) {
    return { totalTokens: null, costUsd: null };
  }
  const o = u as Record<string, unknown>;
  const totalTokens =
    typeof o.totalTokens === 'number' && Number.isFinite(o.totalTokens) ? o.totalTokens : null;
  const costUsd = typeof o.costUsd === 'number' && Number.isFinite(o.costUsd) ? o.costUsd : null;
  return { totalTokens, costUsd };
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
        return handle.query<StreamState>('durion:streamState');
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

  function mapExecutionToSummary(info: {
    workflowId: string;
    runId: string;
    type: string;
    status: { name: string };
    taskQueue: string;
    startTime: Date;
    closeTime?: Date;
    memo?: Record<string, unknown>;
  }): StudioWorkflowExecutionSummary {
    const memo = info.memo ?? {};
    const { totalTokens, costUsd } = studioUsageFromMemo(memo);
    return {
      workflowId: info.workflowId,
      runId: info.runId,
      workflowType: info.type,
      status: info.status.name,
      taskQueue: info.taskQueue,
      startTime: info.startTime?.toISOString() ?? null,
      closeTime: info.closeTime?.toISOString() ?? null,
      primitive: studioPrimitiveFromMemo(memo),
      totalTokens,
      costUsd,
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

    async listWorkflowExecutions(
      params?: ListWorkflowExecutionsParams,
    ): Promise<ListWorkflowExecutionsResult> {
      const pageSize = Math.min(Math.max(params?.pageSize ?? 20, 1), 100);
      const tokenBuffer = params?.nextPageToken
        ? Buffer.from(params.nextPageToken, 'base64url')
        : Buffer.alloc(0);

      const wfClient = temporalClient.workflow;
      const dataConverter = (wfClient as unknown as { dataConverter: LoadedDataConverter }).dataConverter;

      const response = await wfClient.workflowService.listWorkflowExecutions({
        namespace,
        query: params?.query?.trim() ? params.query : undefined,
        pageSize,
        nextPageToken: tokenBuffer,
      });

      const rawExecutions = response.executions ?? [];
      const executions: StudioWorkflowExecutionSummary[] = [];

      for (const raw of rawExecutions) {
        const info = await executionInfoFromRaw(raw, dataConverter, raw);
        executions.push(mapExecutionToSummary(info));
      }

      const next = response.nextPageToken;
      const nextPageToken =
        next != null && next.length > 0 ? Buffer.from(next).toString('base64url') : undefined;

      return { executions, nextPageToken };
    },

    async fetchWorkflowHistory(workflowId: string, runId?: string): Promise<unknown> {
      const handle = temporalClient.workflow.getHandle(workflowId, runId);
      const history = await handle.fetchHistory();
      
      try {
        const json = historyToJSON(history);
        return JSON.parse(json) as unknown;
      } catch (err) {
        // Fallback for Temporal SDK bugs throwing 'know how to convert value json/plain' 
        console.warn('historyToJSON failed, falling back to basic mapping', err);
        return { events: history.events?.map((e: any) => (typeof e.toJSON === 'function' ? e.toJSON() : e)) || [] };
      }
    },

    async close(): Promise<void> {
      await connection.close();
    },
  };
}
