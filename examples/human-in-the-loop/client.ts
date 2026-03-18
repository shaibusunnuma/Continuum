/**
 * Human-in-the-loop example client.
 * Starts the draft workflow, intercepts it while waiting, and sends signals.
 * Usage: npx ts-node human-in-the-loop/client.ts
 */
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createClient } from '@ai-runtime/sdk';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const TASK_QUEUE = 'ai-runtime-hitl';
const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';
const TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE ?? 'default';

async function main() {
  const client = await createClient({
    temporalAddress: TEMPORAL_ADDRESS,
    temporalNamespace: TEMPORAL_NAMESPACE,
  });

  const runId = crypto.randomBytes(4).toString('hex');
  const workflowId = `hitl-${runId}`;

  console.log('🚀 Starting email drafter workflow...');
  
  const handle = await client.startWorkflow('draftEmail', {
    taskQueue: TASK_QUEUE,
    workflowId,
    input: { topic: 'Announcing a new 20% discount on all cloud services on Friday' },
  });

  console.log(`Workflow started (ID: ${workflowId}). Waiting for it to generate the first draft...`);
  
  // Helper to wait until the workflow is explicitly asking for input
  const waitUntilWaiting = async () => {
    while (true) {
      const state = await handle.queryStreamState();
      if (state.status === 'waiting_for_input') return state;
      if (state.status === 'completed') return state;
      await new Promise((r) => setTimeout(r, 1000));
    }
  };

  const state1 = await waitUntilWaiting();
  console.log('\n--- First Draft Generated ---');
  console.log(`Workflow status: ${state1.status}`);
  
  // Reject the first draft
  console.log('\n❌ We do not like the first draft. Sending a REJECT signal with feedback...');
  await handle.signal('ai-runtime:user-input', { 
    action: 'reject', 
    feedback: 'Make it sound more urgent and use emojis!' 
  });
  
  console.log('Signal sent. Waiting for it to write the second draft...');
  
  const state2 = await waitUntilWaiting();
  console.log('\n--- Second Draft Generated ---');
  console.log(`Workflow status: ${state2.status}`);
  
  // Approve the second draft
  console.log('\n✅ The second draft is good. Sending APPROVE signal...');
  await handle.signal('ai-runtime:user-input', { action: 'approve' });
  
  console.log('Signal sent. Waiting for final workflow result...');
  const result = await handle.result();
  
  console.log('\n--- Final Approved Email ---');
  console.log((result as any).finalEmail);
  console.log('----------------------------');
  
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
