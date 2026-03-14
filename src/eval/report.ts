import { Pool } from 'pg';

export async function printDatasetSummary(
  dbUrl: string,
  datasetId: string,
): Promise<void> {
  const pool = new Pool({ connectionString: dbUrl });
  const client = await pool.connect();
  try {
    const res = await client.query(
      `
        select
          v.name as variant,
          m.name as metric,
          avg(s.score) as avg_score,
          count(*) as n
        from eval_scores s
        join eval_variants v on s.variant_id = v.id
        join eval_metrics m on s.metric_id = m.id
        where s.dataset_id = $1
        group by v.name, m.name
        order by m.name, v.name
      `,
      [datasetId],
    );

    // eslint-disable-next-line no-console
    console.log('\nSummary by variant/metric:');
    // eslint-disable-next-line no-console
    console.log('Variant\tMetric\tAvg Score\tN');
    for (const row of res.rows) {
      // eslint-disable-next-line no-console
      console.log(
        `${row.variant}\t${row.metric}\t${Number(row.avg_score).toFixed(
          3,
        )}\t${row.n}`,
      );
    }
  } finally {
    client.release();
    await pool.end();
  }
}

