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
import type { ConnectionOptions } from '@temporalio/client';
import { executionInfoFromRaw } from '@temporalio/client/lib/helpers';
import { historyToJSON } from '@temporalio/common/lib/proto-utils';
import { historyEventsToPlainJson } from './studio-history-json';
import type { LoadedDataConverter } from '@temporalio/common';
import { config } from '../../shared/config';
import { mergeClientConnectionOptions } from './connection-merge';
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
  /**
   * Extra `Connection.connect` options (TLS, API key, metadata, …). Merged after env defaults
   * (`TEMPORAL_API_KEY`, inferred `TEMPORAL_TLS`); this object wins on overlap. Omit `address` (use `temporalAddress`).
   */
  connection?: Omit<ConnectionOptions, 'address'>;
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

  /** Get a handle to an existing workflow by ID; optional `runId` pins a specific execution. */
  getWorkflowHandle<TResult = unknown>(workflowId: string, runId?: string): WorkflowRun<TResult>;

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

/**
 * `WorkflowClient` carries a loaded data converter at runtime for payload decoding, but it is not
 * declared on the public TypeScript type. Validate the shape before use so we fail fast instead of
 * throwing obscure errors inside `executionInfoFromRaw`.
 */
function requireLoadedDataConverterFromWorkflowClient(
  wfClient: unknown,
  context: string,
): LoadedDataConverter {
  if (wfClient === null || typeof wfClient !== 'object') {
    throw new ConfigurationError(
      `${context}: temporalClient.workflow is not an object (SDK / Temporal client mismatch).`,
    );
  }

  const raw = (wfClient as { dataConverter?: unknown }).dataConverter;
  if (raw === undefined) {
    throw new ConfigurationError(
      `${context}: WorkflowClient has no dataConverter. ` +
        'Upgrade @temporalio/client to a version compatible with this SDK, or report this as a bug.',
    );
  }
  if (raw === null || typeof raw !== 'object') {
    throw new ConfigurationError(
      `${context}: dataConverter must be a non-null object.`,
    );
  }

  const dc = raw as Record<string, unknown>;
  const payloadConverter = dc.payloadConverter;
  const failureConverter = dc.failureConverter;
  const payloadCodecs = dc.payloadCodecs;

  if (payloadConverter === null || typeof payloadConverter !== 'object') {
    throw new ConfigurationError(
      `${context}: dataConverter.payloadConverter must be an object (LoadedDataConverter).`,
    );
  }
  const pc = payloadConverter as Record<string, unknown>;
  if (typeof pc.toPayload !== 'function' || typeof pc.fromPayload !== 'function') {
    throw new ConfigurationError(
      `${context}: dataConverter.payloadConverter must implement toPayload and fromPayload.`,
    );
  }

  if (failureConverter === null || typeof failureConverter !== 'object') {
    throw new ConfigurationError(
      `${context}: dataConverter.failureConverter must be an object (LoadedDataConverter).`,
    );
  }
  const fc = failureConverter as Record<string, unknown>;
  if (typeof fc.errorToFailure !== 'function' || typeof fc.failureToError !== 'function') {
    throw new ConfigurationError(
      `${context}: dataConverter.failureConverter must implement errorToFailure and failureToError.`,
    );
  }

  if (!Array.isArray(payloadCodecs)) {
    throw new ConfigurationError(
      `${context}: dataConverter.payloadCodecs must be an array (LoadedDataConverter).`,
    );
  }

  return raw as LoadedDataConverter;
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

  const connection = await Connection.connect(
    mergeClientConnectionOptions(address, cfg?.connection),
  );
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
    parentExecution?: { workflowId: string | null; runId: string | null };
    rootExecution?: { workflowId: string | null; runId: string | null };
  }): StudioWorkflowExecutionSummary {
    const memo = info.memo ?? {};
    const { totalTokens, costUsd } = studioUsageFromMemo(memo);
    const parent = info.parentExecution;
    const root = info.rootExecution;
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
      parentWorkflowId: parent?.workflowId ?? null,
      parentRunId: parent?.runId ?? null,
      rootWorkflowId: root?.workflowId ?? null,
      rootRunId: root?.runId ?? null,
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

    getWorkflowHandle<TResult>(workflowId: string, runId?: string): WorkflowRun<TResult> {
      const handle = temporalClient.workflow.getHandle(workflowId, runId);
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
      const dataConverter = requireLoadedDataConverterFromWorkflowClient(
        wfClient,
        'SdkClient.listWorkflowExecutions',
      );

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
      } catch {
        // proto3-json-serializer rejects some Payload metadata (e.g. json/plain). Protobufjs
        // `HistoryEvent.toObject` yields Studio-compatible JSON for parse-history.
        return historyEventsToPlainJson(history);
      }
    },

    async close(): Promise<void> {
      await connection.close();
    },
  };
}
