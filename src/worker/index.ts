import { NativeConnection, Worker } from '@temporalio/worker';
import { config } from '../shared/config';
import * as activities from './activities/echo';

async function run() {
  const connection = await NativeConnection.connect({
    address: config.TEMPORAL_ADDRESS,
  });

  try {
    const worker = await Worker.create({
      connection,
      namespace: config.TEMPORAL_NAMESPACE,
      taskQueue: config.TASK_QUEUE,
      workflowsPath: require.resolve('./workflows'),
      activities,
    });

    console.log(`Worker started, task queue: ${config.TASK_QUEUE}`);
    await worker.run();
  } finally {
    await connection.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
