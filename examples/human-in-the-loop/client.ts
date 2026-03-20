/**
 * Human-in-the-loop example client.
 * Starts the draft workflow, intercepts it while waiting, and sends signals.
 * Usage: npx ts-node human-in-the-loop/client.ts
 */
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createClient } from '@ai-runtime/sdk';
import { draftEmail } from './workflows';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

async function main() {
  const client = await createClient({ taskQueue: 'ai-runtime-hitl' });

  const runId = crypto.randomBytes(4).toString('hex');
  const workflowId = `hitl-${runId}`;

  console.log('Starting email drafter workflow...');

  const handle = await client.start(draftEmail, {
    workflowId,
    input: { topic: 'Announcing a new 20% discount on all cloud services on Friday' },
  });

  console.log(`Workflow started (ID: ${workflowId}). Waiting for first draft...`);

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

  console.log('\nRejecting first draft with feedback...');
  await handle.signal('ai-runtime:user-input', {
    action: 'reject',
    feedback: 'Make it sound more urgent and use emojis!',
  });

  console.log('Signal sent. Waiting for second draft...');

  const state2 = await waitUntilWaiting();
  console.log('\n--- Second Draft Generated ---');
  console.log(`Workflow status: ${state2.status}`);

  console.log('\nApproving second draft...');
  await handle.signal('ai-runtime:user-input', { action: 'approve' });

  console.log('Signal sent. Waiting for final result...');
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
