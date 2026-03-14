/**
 * Eval plugin: registers a lifecycle hook to capture run completion for evaluation.
 * Call registerEvalHook() when initEvaluation() is enabled (done automatically by initEvaluation).
 */
import { registerHook } from '@ai-runtime/sdk';
import { recordEvalRun } from './capture';

export function registerEvalHook(): void {
  registerHook(async (event) => {
    if (event.type === 'run:complete') {
      await recordEvalRun({
        kind: event.payload.kind,
        name: event.payload.name,
        workflowId: event.payload.workflowId,
        runId: event.payload.runId,
        modelId: event.payload.modelId,
        input: event.payload.input,
        output: event.payload.output,
        metadata: event.payload.metadata,
      });
    }
  });
}
