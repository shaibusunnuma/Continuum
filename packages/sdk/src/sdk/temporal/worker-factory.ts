import { NativeConnection, Worker } from '@temporalio/worker';
import { config } from '../../shared/config';
import * as sdkActivities from './activities';

/** Options for createWorker. workflowsPath must point to a file that exports workflow/agent functions. */
export interface CreateWorkerConfig {
  /** Path to the workflow bundle entry (e.g. require.resolve('./my-workflows')). */
  workflowsPath: string;
  /** Temporal task queue; defaults to config.TASK_QUEUE. */
  taskQueue?: string;
  /** Temporal server address; defaults to config.TEMPORAL_ADDRESS. */
  temporalAddress?: string;
  /** Temporal server namespace; defaults to config.TEMPORAL_NAMESPACE. */
  temporalNamespace?: string;
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
 * Call after defineModels and defineTool. Returns a handle; call handle.run() to block or handle.shutdown() to stop.
 * @param cfg - workflowsPath (required), optional taskQueue, temporalAddress, temporalNamespace
 */
export async function createWorker(cfg: CreateWorkerConfig): Promise<WorkerHandle> {
  const address = cfg.temporalAddress ?? config.TEMPORAL_ADDRESS;
  const namespace = cfg.temporalNamespace ?? config.TEMPORAL_NAMESPACE;
  const taskQueue = cfg.taskQueue ?? config.TASK_QUEUE;

  const connection = await NativeConnection.connect({ address });
  const worker = await Worker.create({
    connection,
    namespace,
    taskQueue,
    workflowsPath: cfg.workflowsPath,
    activities: sdkActivities,
  });

  console.log(`[ai-runtime] Worker started — task queue: ${taskQueue}`);

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
