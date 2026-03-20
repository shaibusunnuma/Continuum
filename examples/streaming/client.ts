/**
 * Streaming example client.
 * Starts the streaming agent and polls `streamState` every second.
 * Usage: npx ts-node streaming/client.ts "Write a research report on the history of computers"
 */
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createClient } from '@ai-runtime/sdk';
import { streamingAgent } from './workflows';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

async function main() {
  const query = process.argv.slice(2).join(' ') || "Research the history of UNIX.";

  const client = await createClient({ taskQueue: 'ai-runtime-streaming' });

  console.log('Starting streaming agent with query:', query);
  console.log('--------------------------------------------------');

  const runId = crypto.randomBytes(4).toString('hex');
  const handle = await client.start(streamingAgent, {
    workflowId: `streaming-${runId}`,
    input: { message: query },
  });

  const interval = setInterval(async () => {
    try {
      const state = await handle.queryStreamState();

      const messages = state.messages ?? [];
      const lastMessage = messages[messages.length - 1];
      const role = lastMessage ? lastMessage.role : 'none';
      const steps = state.currentStep;

      let indicator = 'running';
      if (state.status === 'completed') indicator = 'done';
      else if (state.status === 'waiting_for_input') indicator = 'waiting';

      console.log(`[${indicator}] Step ${steps} | Status: ${state.status} | Last Role: ${role} | Updated: ${state.updatedAt}`);

      if (state.partialReply) {
         console.log(`   Partial reply: ...${state.partialReply.slice(-50)}`);
      }
    } catch (err) {
      console.error('Error querying state:', (err as Error).message);
    }
  }, 1500);

  try {
    const result = await handle.result();
    console.log('--------------------------------------------------');
    console.log('Final Result:', (result as any).reply);
  } finally {
    clearInterval(interval);
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
