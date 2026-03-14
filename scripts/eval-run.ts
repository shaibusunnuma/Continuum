#!/usr/bin/env ts-node

import path from 'path';
import dotenv from 'dotenv';

// Load .env from project root (scripts/ is one level below root)
dotenv.config({ path: path.join(path.resolve(__dirname, '..'), '.env') });

import { Pool } from 'pg';
import {
  metrics,
  buildMetricContext,
  printDatasetSummary,
  type MetricImpl,
} from '@ai-runtime/eval';

type Args = {
  dataset: string; // name:version
  variants: string[]; // comma-separated
  metricNames: string[]; // comma-separated
};

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dataset') args.dataset = argv[++i];
    else if (arg === '--variants')
      args.variants = argv[++i].split(',').map((s) => s.trim());
    else if (arg === '--metrics')
      args.metricNames = argv[++i].split(',').map((s) => s.trim());
  }

  if (!args.dataset || !args.variants || !args.metricNames) {
    // eslint-disable-next-line no-console
    console.error(
      'Usage: eval-run --dataset <name:version> --variants v1,v2 --metrics helpfulness,exact_match',
    );
    process.exit(1);
  }

  return args as Args;
}

async function main(): Promise<void> {
  const dbUrl = process.env.AI_RUNTIME_EVAL_DB_URL;
  if (!dbUrl) {
    // eslint-disable-next-line no-console
    console.error('AI_RUNTIME_EVAL_DB_URL is not set');
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  const [datasetName, versionStr] = args.dataset.split(':');
  const datasetVersion = Number(versionStr);

  const pool = new Pool({ connectionString: dbUrl });
  const client = await pool.connect();

  try {
    const datasetRes = await client.query(
      `
        select id
        from eval_datasets
        where name = $1 and version = $2
      `,
      [datasetName, datasetVersion],
    );
    if (datasetRes.rowCount === 0) {
      // eslint-disable-next-line no-console
      console.error(
        `Dataset not found: ${datasetName} v${datasetVersion}. Build it with eval:build-dataset first.`,
      );
      process.exit(1);
    }
    const datasetId = datasetRes.rows[0].id as string;

    const variantsRes = await client.query(
      `
        select id, name
        from eval_variants
        where name = any($1::text[])
      `,
      [args.variants],
    );
    const variantsByName = new Map<string, string>();
    for (const row of variantsRes.rows) {
      variantsByName.set(row.name as string, row.id as string);
    }
    for (const v of args.variants) {
      if (!variantsByName.has(v)) {
        // eslint-disable-next-line no-console
        console.warn(`Warning: variant "${v}" not found; skipping.`);
      }
    }

    const metricImpls: [string, MetricImpl][] = [];
    for (const name of args.metricNames) {
      const impl = metrics[name];
      if (!impl) {
        // eslint-disable-next-line no-console
        console.warn(`Warning: metric "${name}" not registered; skipping.`);
        continue;
      }
      metricImpls.push([name, impl]);
    }
    if (metricImpls.length === 0) {
      // eslint-disable-next-line no-console
      console.error('No valid metrics to run.');
      process.exit(1);
    }

    const metricsRes = await client.query(
      `
        insert into eval_metrics (name, kind, definition)
        select name, kind, null
        from unnest($1::text[], $2::text[]) as t(name, kind)
        on conflict (name) do update set kind = excluded.kind
        returning id, name
      `,
      [
        metricImpls.map(([name]) => name),
        metricImpls.map(([_, impl]) => impl.kind),
      ],
    );
    const metricIds = new Map<string, string>();
    for (const row of metricsRes.rows) {
      metricIds.set(row.name as string, row.id as string);
    }

    // Load each example with its run's variant_id so we only score against the variant that produced it
    const examplesRes = await client.query(
      `
        select e.id,
               e.input,
               e.output,
               e.context,
               r.variant_id
        from eval_dataset_examples de
        join eval_examples e on de.example_id = e.id
        join eval_runs r on e.run_id = r.id
        where de.dataset_id = $1
      `,
      [datasetId],
    );

    const requestedVariantIds = new Set(
      args.variants
        .map((name) => variantsByName.get(name))
        .filter((id): id is string => id != null),
    );

    let inserted = 0;
    for (const exampleRow of examplesRes.rows) {
      const variantId = exampleRow.variant_id as string | null;
      if (!variantId || !requestedVariantIds.has(variantId)) continue;

      const example = {
        id: exampleRow.id as string,
        runId: '', // not needed for metrics
        input: exampleRow.input,
        output: exampleRow.output,
        context: exampleRow.context,
      };
      const ctx = buildMetricContext(example);

      for (const [metricName, impl] of metricImpls) {
        const metricId = metricIds.get(metricName);
        if (!metricId) continue;

        const result = await impl.run(ctx);
        await client.query(
          `
            insert into eval_scores (dataset_id, example_id, variant_id, metric_id, score, label, details)
            values ($1, $2, $3, $4, $5, $6, $7)
          `,
          [
            datasetId,
            example.id,
            variantId,
            metricId,
            result.score,
            result.label ?? null,
            result.details ? JSON.stringify(result.details) : null,
          ],
        );
        inserted++;
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `Inserted ${inserted} eval_scores for dataset ${datasetName} v${datasetVersion}.`,
    );

    await printDatasetSummary(dbUrl, datasetId);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

