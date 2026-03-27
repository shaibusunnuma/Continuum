/**
 * Graph pipeline example — runner.
 *
 *   worker  — poll Temporal (default). Run in terminal 1.
 *   demo    — start graph via createClient (terminal 2; worker must be running).
 *
 * From examples/:
 *   npm run worker:graph-pipeline
 *   npm run client:graph-pipeline -- research "artificial intelligence"
 *   npm run client:graph-pipeline -- parallel "quantum computing"
 */
import path from 'path';
import dotenv from 'dotenv';
import { openai } from '@ai-sdk/openai';
import { createApp, createClient, initObservability } from '@durion/sdk';
import { researchPipeline, parallelAnalysis } from './workflows';
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
async function runResearchDemo(topic: string): Promise<void> {
  const client = await createClient({ taskQueue: TASK_QUEUE });
  try {
    console.log(`Starting researchPipeline for: "${topic}"`);
    console.log('Graph topology:', JSON.stringify(researchPipeline.topology, null, 2));
    const handle = await client.start(researchPipeline, {
      input: { topic },
    });
    const result = await handle.result();
    console.log('\n─── Research Pipeline Result ───');
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
async function runParallelDemo(topic: string): Promise<void> {
  const client = await createClient({ taskQueue: TASK_QUEUE });
  try {
    console.log(`Starting parallelAnalysis for: "${topic}"`);
    console.log('Graph topology:', JSON.stringify(parallelAnalysis.topology, null, 2));
    const handle = await client.start(parallelAnalysis, {
      input: { topic },
    });
    const result = await handle.result();
    console.log('\n─── Parallel Analysis Result ───');
    console.log(`Status: ${result.status}`);
    console.log(`Executed nodes: ${result.executedNodes.join(' → ')}`);
    console.log(`Perspectives: ${result.output.perspectives.join(', ')}`);
    console.log(`Total tokens: ${result.totalUsage.totalTokens}`);
    console.log(`\nTechnical:\n${result.output.technicalAnalysis}`);
    console.log(`\nPractical:\n${result.output.practicalAnalysis}`);
    console.log(`\nSynthesis:\n${result.output.synthesis}`);
    if (result.error) {
      console.error(`Error in node "${result.error.node}": ${result.error.message}`);
    }
  } finally {
    await client.close();
  }
}
async function main(): Promise<void> {
  const mode = process.argv[2] ?? 'worker';
  const topic = process.argv.slice(3).join(' ') || 'quantum computing';
  if (mode === 'worker') await runWorker();
  else if (mode === 'research') await runResearchDemo(topic);
  else if (mode === 'parallel') await runParallelDemo(topic);
  else {
    console.error('Usage: run.ts [worker|research|parallel] "<topic>"');
     process.exit(1);
  }
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
