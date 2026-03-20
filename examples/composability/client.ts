/**
 * Start composability demos against a running worker.
 *
 * Usage (from repo root, after `npm run build` and `npm run worker:composability`):
 *   npx ts-node examples/composability/client.ts parent "hello world"
 *   npx ts-node examples/composability/client.ts orchestrator "Ask the specialist: what is 2+2?"
 *
 * Or from examples/: npm run client:composability -- parent "hello"
 */
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@ai-runtime/sdk';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const TASK_QUEUE = 'ai-runtime-composability';
const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';
const TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE ?? 'default';

type Mode = 'parent' | 'orchestrator';

async function main() {
  const mode = (process.argv[2] ?? 'parent') as Mode;
  const text = process.argv.slice(3).join(' ') || 'hello composability';

  if (mode !== 'parent' && mode !== 'orchestrator') {
    console.error('First arg must be "parent" or "orchestrator".');
    process.exit(1);
  }

  const client = await createClient({
    temporalAddress: TEMPORAL_ADDRESS,
    temporalNamespace: TEMPORAL_NAMESPACE,
  });

  try {
    if (mode === 'parent') {
      console.log('Starting composabilityParent with message:', text);
      const run = await client.startWorkflow('composabilityParent', {
        taskQueue: TASK_QUEUE,
        input: { message: text },
      });
      const result = await run.result();
      console.log('Result:', JSON.stringify(result, null, 2));
    } else {
      console.log('Starting composabilityOrchestrator with message:', text);
      const run = await client.startWorkflow('composabilityOrchestrator', {
        taskQueue: TASK_QUEUE,
        input: { message: text },
      });
      const result = await run.result();
      console.log('Result:', JSON.stringify(result, null, 2));
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
