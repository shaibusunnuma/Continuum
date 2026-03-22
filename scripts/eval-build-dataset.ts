#!/usr/bin/env ts-node

import path from 'path';
import dotenv from 'dotenv';

// Load .env from project root (scripts/ is one level below root)
dotenv.config({ path: path.join(path.resolve(__dirname, '..'), '.env') });

import { Pool } from 'pg';

type Args = {
  name: string;
  version: number;
  workflow?: string;
  from?: string;
  to?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (i + 1 >= argv.length) break;
    const val = argv[i + 1];
    if (arg === '--name') {
      args.name = val;
      i++;
    } else if (arg === '--version') {
      const n = Number(val);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        // eslint-disable-next-line no-console
        console.error('--version must be an integer');
        process.exit(1);
      }
      args.version = n;
      i++;
    } else if (arg === '--workflow') {
      args.workflow = val;
      i++;
    } else if (arg === '--from') {
      args.from = val;
      i++;
    } else if (arg === '--to') {
      args.to = val;
      i++;
    }
  }

  if (!args.name || args.version == null) {
    // eslint-disable-next-line no-console
    console.error(
      'Usage: eval-build-dataset --name <name> --version <n> [--workflow <name>] [--from <iso>] [--to <iso>]',
    );
    process.exit(1);
  }

  return args as Args;
}

async function main(): Promise<void> {
  const dbUrl = process.env.DURION_EVAL_DB_URL;
  if (!dbUrl) {
    // eslint-disable-next-line no-console
    console.error('DURION_EVAL_DB_URL is not set');
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  const pool = new Pool({ connectionString: dbUrl });

  const client = await pool.connect();
  try {
    await client.query('begin');

    const datasetRes = await client.query(
      `
        insert into eval_datasets (name, version, description, filters)
        values ($1, $2, $3, $4)
        returning id
      `,
      [
        args.name,
        args.version,
        `Dataset ${args.name} v${args.version}`,
        JSON.stringify({
          workflow: args.workflow,
          from: args.from,
          to: args.to,
        }),
      ],
    );

    const datasetId = datasetRes.rows[0].id as string;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (args.workflow) {
      params.push(args.workflow);
      conditions.push(`r.name = $${params.length}`);
    }
    if (args.from) {
      params.push(args.from);
      conditions.push(`e.created_at >= $${params.length}`);
    }
    if (args.to) {
      params.push(args.to);
      conditions.push(`e.created_at <= $${params.length}`);
    }

    const whereClause =
      conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';

    const examplesRes = await client.query(
      `
        select e.id
        from eval_examples e
        join eval_runs r on e.run_id = r.id
        ${whereClause}
      `,
      params,
    );

    for (const row of examplesRes.rows) {
      await client.query(
        `
          insert into eval_dataset_examples (dataset_id, example_id)
          values ($1, $2)
          on conflict do nothing
        `,
        [datasetId, row.id],
      );
    }

    await client.query('commit');

    // eslint-disable-next-line no-console
    console.log(
      `Created dataset ${args.name} v${args.version} with ${examplesRes.rowCount} examples`,
    );
  } catch (err) {
    await client.query('rollback');
    // eslint-disable-next-line no-console
    console.error('Failed to build dataset:', err);
    process.exitCode = 1;
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

