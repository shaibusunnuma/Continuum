import Fastify from 'fastify';
import { config } from '../config';
import { initObservability } from '@ai-runtime/sdk';
import { startTelemetry, shutdownTelemetry } from '../otel';
import { workflowsRoutes } from './routes/workflows';
import { agentsRoutes } from './routes/agents';
import { runsRoutes } from './routes/runs';

async function main(): Promise<void> {
  await startTelemetry();

  initObservability({
    tracing: { enabled: process.env.AI_RUNTIME_ENABLE_TRACING === '1' },
    metrics: { enabled: process.env.AI_RUNTIME_ENABLE_METRICS === '1' },
  });

  const fastify = Fastify({ logger: true });

  await fastify.register(workflowsRoutes, { prefix: '/workflows' });
  await fastify.register(agentsRoutes, { prefix: '/agents' });
  await fastify.register(runsRoutes, { prefix: '/runs' });

  try {
    await fastify.listen({ port: config.API_PORT, host: '0.0.0.0' });
    console.log(`Runtime API listening on port ${config.API_PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  const shutdown = async (): Promise<void> => {
    await shutdownTelemetry();
    try {
      await fastify.close();
    } catch (err) {
      fastify.log.error(err);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => {
    shutdown().catch((err) => {
      fastify.log.error(err);
      process.exit(1);
    });
  });
  process.on('SIGTERM', () => {
    shutdown().catch((err) => {
      fastify.log.error(err);
      process.exit(1);
    });
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
