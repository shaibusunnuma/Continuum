/**
 * Multi-Agent Pattern B: Orchestrator script.
 * Runs researchAgent -> coderAgent -> analystAgent in sequence via the Temporal client.
 * Prerequisites: Temporal server running, worker running (npm run worker:multi-agent).
 * Usage: npx ts-node multi-agent/orchestrate.ts "Your question here"
 */
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createClient, type AgentResult } from '@ai-runtime/sdk';
import { researchAgent, coderAgent, analystAgent } from './workflows';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

async function runChain(query: string): Promise<{ research: string; coder: string; analyst: string }> {
  const client = await createClient({ taskQueue: 'ai-runtime-multi-agent' });

  const runId = crypto.randomBytes(4).toString('hex');

  const researchHandle = await client.start(researchAgent, {
    workflowId: `multi-b-${runId}-research`,
    input: { message: query },
  });
  const researchResult = await researchHandle.result() as AgentResult;
  const researchReply = researchResult.reply ?? '';

  const coderHandle = await client.start(coderAgent, {
    workflowId: `multi-b-${runId}-coder`,
    input: { message: researchReply },
  });
  const coderResult = await coderHandle.result() as AgentResult;
  const coderReply = coderResult.reply ?? '';

  const analystHandle = await client.start(analystAgent, {
    workflowId: `multi-b-${runId}-analyst`,
    input: { message: coderReply },
  });
  const analystResult = await analystHandle.result() as AgentResult;
  const analystReply = analystResult.reply ?? '';

  await client.close();
  return { research: researchReply, coder: coderReply, analyst: analystReply };
}

async function main() {
  const query = process.argv.slice(2).join(' ');
  console.log('Query:', query);
  console.log('Running Pattern B chain: researchAgent -> coderAgent -> analystAgent\n');
  const result = await runChain(query);
  console.log('Research:', result.research);
  console.log('Coder:', result.coder);
  console.log('Analyst:', result.analyst);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
