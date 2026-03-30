/**
 * createApp — single entry to wire runtime + worker + client with shared Temporal settings.
 *
 * Usage (worker process):
 *   const app = await createApp({ models: {...}, tools: [...], workflowsPath: require.resolve('./workflows') });
 *   const worker = await app.createWorker();
 *   await worker.run();
 *
 * Usage (API process — same runtime config, or a minimal runtime if only starting workflows):
 *   const app = await createApp({ workflowsPath: require.resolve('./workflows'), models: {...} });
 *   const handle = await app.start(myWorkflow, { input: { message: 'hi' } });
 *   await app.close();
 */
import { config as sharedConfig } from '../shared/config';
import type { RuntimeContext } from './runtime';
import { ConfigurationError } from './errors';
import { createRuntime, type CreateRuntimeConfig } from './runtime';
import type { ConnectionOptions } from '@temporalio/client';
import type { NativeConnectionOptions } from '@temporalio/worker';
import { createWorker, type CreateWorkerConfig, type WorkerHandle } from './temporal/worker-factory';
import { createClient, type SdkClient, type StartWorkflowOptions, type WorkflowRun } from './temporal/client';

/** App configuration: everything `createRuntime` accepts, plus workflow bundle path and Temporal overrides. */
export interface CreateAppConfig extends CreateRuntimeConfig {
  /** Path to the workflow bundle entry (e.g. require.resolve('./workflows')). */
  workflowsPath: string;
  /** Default task queue for worker and client. Falls back to TASK_QUEUE env / `durion`. */
  taskQueue?: string;
  temporalAddress?: string;
  temporalNamespace?: string;
  /** Passed to `createClient` (merged with env TLS / API key). */
  connection?: Omit<ConnectionOptions, 'address'>;
  /** Passed to `createWorker` (merged with env TLS / API key). */
  nativeConnection?: Omit<NativeConnectionOptions, 'address'>;
}

/** Application handle: shared runtime, factory for worker, cached Temporal client, convenience starters. */
export interface App {
  readonly runtime: RuntimeContext;
  readonly workflowsPath: string;
  /** Resolved default task queue (worker + client). */
  readonly taskQueue: string;

  /**
   * Create a worker for this app's runtime and workflows.
   * Does not call run(); you usually `await (await app.createWorker()).run()` in the worker process.
   */
  createWorker(
    overrides?: Partial<
      Pick<
        CreateWorkerConfig,
        'taskQueue' | 'temporalAddress' | 'temporalNamespace' | 'nativeConnection' | 'observability'
      >
    >,
  ): Promise<WorkerHandle>;

  /**
   * Temporal client with the app's default task queue and address.
   * Cached until `close()`; safe to call multiple times.
   */
  client(): Promise<SdkClient>;

  /** Type-safe start; uses cached client. */
  start<TInput, TResult>(
    workflow: (input: TInput) => Promise<TResult>,
    options: StartWorkflowOptions<TInput>,
  ): Promise<WorkflowRun<TResult>>;

  /** String workflow type; uses cached client. */
  startWorkflow<TInput, TResult>(
    workflowType: string,
    options: StartWorkflowOptions<TInput>,
  ): Promise<WorkflowRun<TResult>>;

  /** Close the cached Temporal client connection. */
  close(): Promise<void>;
}

/**
 * Create an app: runtime + shared Temporal defaults + factories for worker and client.
 */
export async function createApp(cfg: CreateAppConfig): Promise<App> {
  const {
    workflowsPath,
    taskQueue: cfgTaskQueue,
    temporalAddress: cfgTemporalAddress,
    temporalNamespace: cfgTemporalNamespace,
    connection: cfgConnection,
    nativeConnection: cfgNativeConnection,
    ...runtimeConfig
  } = cfg;

  if (typeof workflowsPath !== 'string' || workflowsPath.trim() === '') {
    throw new ConfigurationError('createApp: workflowsPath must be a non-empty string.');
  }

  const runtime = createRuntime(runtimeConfig);
  const taskQueue = cfgTaskQueue ?? sharedConfig.TASK_QUEUE;
  const temporalAddress = cfgTemporalAddress ?? sharedConfig.TEMPORAL_ADDRESS;
  const temporalNamespace = cfgTemporalNamespace ?? sharedConfig.TEMPORAL_NAMESPACE;

  let cachedClient: SdkClient | null = null;
  let clientPromise: Promise<SdkClient> | null = null;

  async function getClient(): Promise<SdkClient> {
    if (cachedClient) return cachedClient;
    if (!clientPromise) {
      clientPromise = createClient({
        taskQueue,
        temporalAddress,
        temporalNamespace,
        connection: cfgConnection,
      }).then((c) => {
        cachedClient = c;
        return c;
      });
    }
    return clientPromise;
  }

  return {
    runtime,
    workflowsPath,
    taskQueue,

    createWorker: (overrides = {}) =>
      createWorker({
        runtime,
        workflowsPath,
        taskQueue: overrides.taskQueue ?? taskQueue,
        temporalAddress: overrides.temporalAddress ?? temporalAddress,
        temporalNamespace: overrides.temporalNamespace ?? temporalNamespace,
        nativeConnection: { ...(cfgNativeConnection ?? {}), ...(overrides.nativeConnection ?? {}) },
        observability: overrides.observability,
      }),

    client: () => getClient(),

    start: async (wf, opts) => (await getClient()).start(wf, opts),

    startWorkflow: async (type, opts) => (await getClient()).startWorkflow(type, opts),

    close: async () => {
      if (cachedClient) {
        await cachedClient.close();
        cachedClient = null;
        clientPromise = null;
      }
    },
  };
}
