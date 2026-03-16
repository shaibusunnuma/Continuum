/**
 * Multi-Agent Pattern B: Orchestrator script.
 * Runs researchAgent → coderAgent → analystAgent in sequence via the Temporal client.
 * Prerequisites: Temporal server running, worker running (npm run worker:multi-agent).
 * Usage: npx ts-node multi-agent/orchestrate.ts "Your question here"
 */
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { Connection, Client } from '@temporalio/client';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

// Match the dedicated task queue used by examples/multi-agent/worker.ts
const TASK_QUEUE = 'ai-runtime-multi-agent';
const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';
const TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE ?? 'default';

interface AgentResult {
  reply: string;
  finishReason: string;
  steps: number;
  usage: { costUsd: number; totalTokens: number };
}

async function runChain(query: string): Promise<{ research: string; coder: string; analyst: string }> {
  const connection = await Connection.connect({ address: TEMPORAL_ADDRESS });
  const client = new Client({
    connection,
    namespace: TEMPORAL_NAMESPACE,
  });

  const runId = crypto.randomBytes(4).toString('hex');

  const researchHandle = await client.workflow.start('researchAgent', {
    taskQueue: TASK_QUEUE,
    workflowId: `multi-b-${runId}-research`,
    args: [{ message: query }],
  });
  const researchResult = await researchHandle.result() as AgentResult;
  const researchReply = researchResult.reply ?? '';

  const coderHandle = await client.workflow.start('coderAgent', {
    taskQueue: TASK_QUEUE,
    workflowId: `multi-b-${runId}-coder`,
    args: [{ message: researchReply }],
  });
  const coderResult = await coderHandle.result() as AgentResult;
  const coderReply = coderResult.reply ?? '';

  const analystHandle = await client.workflow.start('analystAgent', {
    taskQueue: TASK_QUEUE,
    workflowId: `multi-b-${runId}-analyst`,
    args: [{ message: coderReply }],
  });
  const analystResult = await analystHandle.result() as AgentResult;
  const analystReply = analystResult.reply ?? '';

  await connection.close();
  return { research: researchReply, coder: coderReply, analyst: analystReply };
}

async function main() {
  const query = process.argv.slice(2).join(' ');
  console.log('Query:', query);
  console.log('Running Pattern B chain: researchAgent → coderAgent → analystAgent\n');
  const result = await runChain(query);
  console.log('Research:', result.research);
  console.log('Coder:', result.coder);
  console.log('Analyst:', result.analyst);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
