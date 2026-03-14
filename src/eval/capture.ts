import { isEvaluationEnabled, withDefaultVariantName } from './config';
import { ensureVariant, insertRun, insertExample } from './store';
import type { EvalCaptureParams } from './types';

/**
 * Records a single evaluation example (input + output) for a workflow or agent run.
 * No-ops if evaluation is disabled or the DB is not available.
 */
export async function recordEvalRun(
  rawParams: EvalCaptureParams,
): Promise<void> {
  if (!isEvaluationEnabled()) return;

  const params = withDefaultVariantName(rawParams);

  try {
    const variant = await ensureVariant({
      variantName: params.variantName,
      modelId: params.modelId,
      provider: params.provider,
      metadata: params.metadata,
    });

    const run = await insertRun({
      workflowId: params.workflowId,
      runId: params.runId,
      kind: params.kind,
      name: params.name,
      variantId: variant.id,
      completedAt: new Date(),
      metadata: params.metadata,
    });

    await insertExample({
      runId: run.id,
      input: params.input,
      output: params.output,
      context: undefined,
    });
  } catch (err) {
    // Evaluation capture must never break the main workflow/agent execution.
    // eslint-disable-next-line no-console
    console.error('[ai-runtime] Failed to record evaluation run:', err);
  }
}

