/**
 * Graph pipeline example — runner.
 *
 *   worker  — poll Temporal (default). Run in terminal 1.
 *   demo    — start graph via createClient (terminal 2; worker must be running).
 *
 * From examples/:
 *   npm run worker:graph-pipeline
 *   npm run client:graph-pipeline -- "artificial intelligence"
 */
import path from 'path';
import dotenv from 'dotenv';
import { openai } from '@ai-sdk/openai';
import { createApp, createClient, initObservability } from '@durion/sdk';
import { researchPipeline } from './workflows';
const TASK_QUEUE = 'durion-graph-pipeline';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
async function runWorker(): Promise<void> {
  initObservability({ tracing: { enabled: true }, metrics: { enabled: true } });
  const app = await createApp({
    models: { fast: openai.chat('gpt-4o-mini') },
    tools: [],
    workflowsPath: require.resolve('./workflows'),
    taskQueue: TASK_QUEUE,
  });
  const handle = await app.createWorker();
  const shutdown = (): void => {
    handle.shutdown().catch((err) => {
      console.error('Worker shutdown error:', err);
      process.exit(1);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  console.log(`Graph pipeline worker — task queue: ${TASK_QUEUE}`);
  await handle.run();
}
async function runDemo(): Promise<void> {
  const topic = process.argv.slice(3).join(' ') || 'quantum computing';
  const client = await createClient({ taskQueue: TASK_QUEUE });
  try {
    console.log(`Starting researchPipeline for: "${topic}"`);
    // Log the static topology (no execution needed)
    console.log('Graph topology:', JSON.stringify(researchPipeline.topology, null, 2));
    const handle = await client.start(researchPipeline, {
      input: { topic },
    });
    const result = await handle.result();
    console.log('\n─── Graph Result ───');
    console.log(`Status: ${result.status}`);
    console.log(`Executed nodes: ${result.executedNodes.join(' → ')}`);
    console.log(`Total tokens: ${result.totalUsage.totalTokens}`);
    console.log(`Final report:\n${result.output.finalReport}`);
    if (result.error) {
      console.error(`Error in node "${result.error.node}": ${result.error.message}`);
    }
  } finally {
    await client.close();
  }
}
async function main(): Promise<void> {
  const mode = process.argv[2] ?? 'worker';
  if (mode === 'worker') await runWorker();
  else if (mode === 'demo') await runDemo();
  else {
    console.error('Usage: run.ts [worker|demo] ...');
    process.exit(1);
  }
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
