import { Pool } from 'pg';
import { getEvaluationDbUrl } from './config';
import type {
  EvalCaptureParams,
  EvalVariant,
  EvalRun,
  EvalExample,
} from './types';

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;
  const dbUrl = getEvaluationDbUrl();
  if (!dbUrl) {
    throw new Error(
      'Evaluation DB URL is not configured (AI_RUNTIME_EVAL_DB_URL).',
    );
  }
  pool = new Pool({ connectionString: dbUrl });
  return pool;
}

export async function ensureVariant(
  params: Pick<
    EvalCaptureParams,
    'variantName' | 'modelId' | 'provider' | 'metadata'
  >,
): Promise<EvalVariant> {
  const client = getPool();
  const name = params.variantName ?? 'baseline';

  const res = await client.query(
    `
      insert into eval_variants (name, model, provider, config)
      values ($1, $2, $3, $4)
      on conflict (name) do update
        set model = coalesce(excluded.model, eval_variants.model),
            provider = coalesce(excluded.provider, eval_variants.provider),
            config = coalesce(excluded.config, eval_variants.config)
      returning id, name, model, provider, prompt_version as "promptVersion", config
    `,
    [name, params.modelId ?? null, params.provider ?? null, params.metadata ?? null],
  );

  return res.rows[0] as EvalVariant;
}

export async function insertRun(
  run: Omit<EvalRun, 'id'>,
): Promise<EvalRun> {
  const client = getPool();
  const completedAt = run.completedAt instanceof Date
    ? run.completedAt.toISOString()
    : run.completedAt ?? new Date().toISOString();

  const res = await client.query(
    `
      insert into eval_runs (workflow_id, run_id, kind, name, variant_id, completed_at, metadata)
      values ($1, $2, $3, $4, $5, $6, $7)
      returning id, workflow_id as "workflowId", run_id as "runId",
                kind, name, variant_id as "variantId", completed_at as "completedAt", metadata
    `,
    [
      run.workflowId ?? null,
      run.runId ?? null,
      run.kind,
      run.name,
      run.variantId ?? null,
      completedAt,
      run.metadata ?? null,
    ],
  );
  return res.rows[0] as EvalRun;
}

export async function insertExample(
  example: Omit<EvalExample, 'id'>,
): Promise<EvalExample> {
  const client = getPool();
  const res = await client.query(
    `
      insert into eval_examples (run_id, input, output, context)
      values ($1, $2, $3, $4)
      returning id, run_id as "runId", input, output, context
    `,
    [
      example.runId,
      JSON.stringify(example.input),
      example.output !== undefined ? JSON.stringify(example.output) : null,
      example.context !== undefined ? JSON.stringify(example.context) : null,
    ],
  );
  return res.rows[0] as EvalExample;
}

