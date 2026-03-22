import type { EvalCaptureParams } from './types';
import { registerEvalHook } from './plugin';

export type PoolConfig = {
  max?: number;
  idleTimeoutMillis?: number;
};

type EvaluationConfig = {
  enabled: boolean;
  dbUrl?: string;
  defaultVariantName?: string;
  pool?: PoolConfig;
};

let config: EvaluationConfig = {
  enabled: false,
};

export function initEvaluation(opts: {
  enabled: boolean;
  dbUrl?: string;
  defaultVariantName?: string;
  pool?: PoolConfig;
}): void {
  if (!opts.enabled) {
    config = { enabled: false };
    return;
  }

  if (!opts.dbUrl) {
    // If enabled is requested but DB URL is missing, keep evaluation disabled but log once.
    // eslint-disable-next-line no-console
    console.warn(
      '[durion] Evaluation enabled but dbUrl was not provided; disabling evaluation.',
    );
    config = { enabled: false };
    return;
  }

  config = {
    enabled: true,
    dbUrl: opts.dbUrl,
    defaultVariantName: opts.defaultVariantName ?? 'baseline',
    pool: opts.pool,
  };
  registerEvalHook();
  // eslint-disable-next-line no-console
  console.log('[durion] Evaluation capture enabled (default variant: ' + config.defaultVariantName + ')');
}

export function isEvaluationEnabled(): boolean {
  return config.enabled === true && !!config.dbUrl;
}

export function getEvaluationDbUrl(): string | undefined {
  return config.dbUrl;
}

export function getPoolConfig(): PoolConfig | undefined {
  return config.pool;
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

/** Shut down eval resources (DB pool). Call during graceful shutdown. */
export async function shutdownEvaluation(): Promise<void> {
  const { shutdownPool } = await import('./store');
  await shutdownPool();
  config = { enabled: false };
}

