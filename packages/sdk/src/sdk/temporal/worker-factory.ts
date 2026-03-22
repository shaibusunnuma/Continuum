import { NativeConnection, Worker } from '@temporalio/worker';
import { config } from '../../shared/config';
import * as sdkActivities from './activities';
import type { RuntimeContext } from '../runtime';
import type { ObservabilityConfig } from '../obs';
import { setActiveRuntime } from '../runtime';

/** Options for createWorker. workflowsPath must point to a file that exports workflow/agent functions. */
export interface CreateWorkerConfig {
  /** The RuntimeContext to use for this worker. */
  runtime: RuntimeContext;
  /** Path to the workflow bundle entry (e.g. require.resolve('./my-workflows')). */
  workflowsPath: string;
  /** Temporal task queue; defaults to config.TASK_QUEUE. */
  taskQueue?: string;
  /** Temporal server address; defaults to config.TEMPORAL_ADDRESS. */
  temporalAddress?: string;
  /** Temporal server namespace; defaults to config.TEMPORAL_NAMESPACE. */
  temporalNamespace?: string;
  /** Optional observability config (applied to the runtime if provided). */
  observability?: ObservabilityConfig;
}

/** Handle returned by createWorker; call run() to block, shutdown() for graceful stop. */
export interface WorkerHandle {
  /** Run the worker until shutdown. Resolves when the worker has stopped. */
  run(): Promise<void>;
  /** Request graceful shutdown. Safe to call from signal handlers. */
  shutdown(): Promise<void>;
}

/**
 * Creates a Temporal worker that executes SDK workflows and activities (runModel, runTool, runLifecycleHooks).
 * The runtime context is set as the active runtime so activities can resolve models, tools, and hooks.
 * Returns a handle; call handle.run() to block or handle.shutdown() to stop.
 * @param cfg - runtime (required), workflowsPath (required), optional taskQueue, temporalAddress, temporalNamespace, observability
 */
export async function createWorker(cfg: CreateWorkerConfig): Promise<WorkerHandle> {
  const address = cfg.temporalAddress ?? config.TEMPORAL_ADDRESS;
  const namespace = cfg.temporalNamespace ?? config.TEMPORAL_NAMESPACE;
  const taskQueue = cfg.taskQueue ?? config.TASK_QUEUE;

  // Apply observability config if provided (pit of success: co-located with worker creation)
  if (cfg.observability) {
    cfg.runtime.initObservability(cfg.observability);
  }

  // Set the active runtime so activities can access models, tools, hooks
  setActiveRuntime(cfg.runtime);

  const connection = await NativeConnection.connect({ address });
  const worker = await Worker.create({
    connection,
    namespace,
    taskQueue,
    workflowsPath: cfg.workflowsPath,
    activities: sdkActivities,
  });

  console.log(`[durion] Worker started — task queue: ${taskQueue}`);

  const handle: WorkerHandle = {
    async run(): Promise<void> {
      try {
        await worker.run();
      } finally {
        await connection.close();
      }
    },
    shutdown(): Promise<void> {
      worker.shutdown();
      return Promise.resolve();
    },
  };

  return handle;
}
