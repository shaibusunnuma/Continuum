import path from 'path';
import dotenv from 'dotenv';

// Load .env from project root so it works regardless of process cwd (e.g. running from examples/)
const projectRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(projectRoot, '.env') });

export const config = {
  TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
  TEMPORAL_NAMESPACE: process.env.TEMPORAL_NAMESPACE ?? 'default',
  TASK_QUEUE: process.env.TASK_QUEUE ?? 'ai-runtime',
  API_PORT: parseInt(process.env.API_PORT ?? '3000', 10),
};
