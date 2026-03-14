/**
 * Workflow-sandbox code — only @temporalio/workflow imports allowed at runtime.
 * All other imports MUST be `import type` (erased at compile time).
 * Exception: ConfigurationError is used at workflow definition time (before sandbox runs).
 */
import * as wf from '@temporalio/workflow';
import type * as sdkActivities from './activities';
import type {
  WorkflowContext,
  ModelCallParams,
  ModelResult,
  ToolResult,
  Message,
  RunMetadata,
} from '../types';
import { ConfigurationError } from '../errors';

const { runModel, runTool, runLifecycleHooks } = wf.proxyActivities<
  typeof sdkActivities
>({
  startToCloseTimeout: '5 minutes',
  retry: { maximumAttempts: 3 },
});

const userInputSignal = wf.defineSignal<[unknown]>('user-input');

function validateWorkflowArgs<TInput, TOutput>(
  name: string,
  fn: (ctx: WorkflowContext<TInput>) => Promise<TOutput>,
): void {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new ConfigurationError('Workflow name must be a non-empty string.');
  }
  if (typeof fn !== 'function') {
    throw new ConfigurationError('Workflow handler must be a function.');
  }
}

/**
 * Defines a durable workflow with explicit control flow. The returned function is a Temporal workflow (export it and pass workflowsPath to createWorker).
 * @param name - Logical name for logging; use the same as your export name for the workflow type (e.g. "customerSupport")
 * @param fn - Async function receiving ctx (input, model, tool, waitForInput, log, run); return value is the workflow result
 * @returns A Temporal workflow function (input) => Promise<TOutput>
 */
export function workflow<TInput, TOutput>(
  name: string,
  fn: (ctx: WorkflowContext<TInput>) => Promise<TOutput>,
): (input: TInput) => Promise<TOutput> {
  validateWorkflowArgs(name, fn);
  const workflowFn = async function (input: TInput): Promise<TOutput> {
    let accumulatedCost = 0;
    const inputQueue: unknown[] = [];

    wf.setHandler(userInputSignal, (data: unknown) => {
      inputQueue.push(data);
    });

    const info = wf.workflowInfo();

    const ctx: WorkflowContext<TInput> = {
      input,

      async model(modelId: string, params: ModelCallParams): Promise<ModelResult> {
        const messages: Message[] = params.messages ? [...params.messages] : [];
        if (params.prompt) {
          messages.push({ role: 'user', content: params.prompt });
        }

        const result = await runModel({
          modelId,
          messages,
          toolNames: params.tools,
          responseFormat: params.responseFormat,
          traceContext: {
            workflowId: info.workflowId,
            runId: info.runId,
            workflowName: name,
          },
        });

        accumulatedCost += result.usage.costUsd;

        return {
          result: result.content,
          usage: result.usage,
        };
      },

      async tool<T = unknown>(toolName: string, toolInput: unknown): Promise<ToolResult<T>> {
        const result = await runTool({
          toolName,
          input: toolInput,
          traceContext: {
            workflowId: info.workflowId,
            runId: info.runId,
            workflowName: name,
          },
        });
        return { result: result.result as T };
      },

      async waitForInput<T = unknown>(_description: string): Promise<T> {
        await wf.condition(() => inputQueue.length > 0);
        return inputQueue.shift() as T;
      },

      log(event: string, data?: unknown): void {
        const payload = data !== undefined ? ` ${JSON.stringify(data)}` : '';
        wf.log.info(`[${name}] ${event}${payload}`);
      },

      run: {
        id: info.workflowId,
        workflowName: name,
        startedAt: new Date(),
        get accumulatedCost() {
          return accumulatedCost;
        },
      } as RunMetadata,
    };

    const result = await fn(ctx);

    await runLifecycleHooks({
      type: 'run:complete',
      payload: {
        kind: 'workflow',
        name,
        workflowId: info.workflowId,
        runId: info.runId,
        input,
        output: result,
      },
    });

    return result;
  };

  Object.defineProperty(workflowFn, 'name', { value: name });
  return workflowFn;
}
