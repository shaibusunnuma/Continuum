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

/**
 * Creates and runs a Temporal worker that executes SDK workflows and activities (runModel, runTool). Call after defineModels and defineTool.
 * Resolves connection and task queue from config or CreateWorkerConfig; runs until process exit.
 * @param cfg - workflowsPath (required), optional taskQueue, temporalAddress, temporalNamespace
 */
export async function createWorker(cfg: CreateWorkerConfig): Promise<void> {
  const address = cfg.temporalAddress ?? config.TEMPORAL_ADDRESS;
  const namespace = cfg.temporalNamespace ?? config.TEMPORAL_NAMESPACE;
  const taskQueue = cfg.taskQueue ?? config.TASK_QUEUE;

  const connection = await NativeConnection.connect({ address });

  try {
    const worker = await Worker.create({
      connection,
      namespace,
      taskQueue,
      workflowsPath: cfg.workflowsPath,
      activities: sdkActivities,
    });

    console.log(`[ai-runtime] Worker started — task queue: ${taskQueue}`);
    await worker.run();
  } finally {
    await connection.close();
  }
}
