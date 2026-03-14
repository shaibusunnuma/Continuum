import type { EvalCaptureParams } from './types';

type EvaluationConfig = {
  enabled: boolean;
  dbUrl?: string;
  defaultVariantName?: string;
};

let config: EvaluationConfig = {
  enabled: false,
};

export function initEvaluation(opts: {
  enabled: boolean;
  dbUrl?: string;
  defaultVariantName?: string;
}): void {
  if (!opts.enabled) {
    config = { enabled: false };
    return;
  }

  if (!opts.dbUrl) {
    // If enabled is requested but DB URL is missing, keep evaluation disabled but log once.
    // eslint-disable-next-line no-console
    console.warn(
      '[ai-runtime] Evaluation requested but AI_RUNTIME_EVAL_DB_URL is not set; disabling evaluation.',
    );
    config = { enabled: false };
    return;
  }

  config = {
    enabled: true,
    dbUrl: opts.dbUrl,
    defaultVariantName: opts.defaultVariantName ?? 'baseline',
  };
  // eslint-disable-next-line no-console
  console.log('[ai-runtime] Evaluation capture enabled (default variant: ' + config.defaultVariantName + ')');
}

export function isEvaluationEnabled(): boolean {
  return config.enabled === true && !!config.dbUrl;
}

export function getEvaluationDbUrl(): string | undefined {
  return config.dbUrl;
}

export function getDefaultVariantName(): string {
  return config.defaultVariantName ?? 'baseline';
}

// Helper to attach a default variant name if caller didn't specify one.
export function withDefaultVariantName(
  params: EvalCaptureParams,
): EvalCaptureParams {
  if (params.variantName) return params;
  return { ...params, variantName: getDefaultVariantName() };
}

