import dotenv from 'dotenv';

dotenv.config();

export const config = {
  TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
  TEMPORAL_NAMESPACE: process.env.TEMPORAL_NAMESPACE ?? 'default',
  TASK_QUEUE: process.env.TASK_QUEUE ?? 'ai-runtime',
  API_PORT: parseInt(process.env.API_PORT ?? '3000', 10),
};
