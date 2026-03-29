import Fastify from 'fastify';
import { config } from '../config';
import { initObservability } from '@durion/sdk';
import { startTelemetry, shutdownTelemetry } from '../otel';
import { gatewayV0AuthPreHandler } from './gateway-v0-auth';
import { workflowsRoutes } from './routes/workflows';
import { agentsRoutes } from './routes/agents';
import { runsRoutes } from './routes/runs';
import { studioRoutes } from './routes/studio';

async function main(): Promise<void> {
  await startTelemetry();

  initObservability({
    tracing: { enabled: true },
    metrics: { enabled: true },
  });

  const fastify = Fastify({ logger: true });

  await fastify.register(workflowsRoutes, { prefix: '/workflows' });
  await fastify.register(agentsRoutes, { prefix: '/agents' });
  await fastify.register(runsRoutes, { prefix: '/runs' });

  /** Gateway API v0 — same handlers + optional `DURION_GATEWAY_TOKEN`. See docs/gateway-api-v0.md */
  await fastify.register(
    async (f) => {
      f.addHook('preHandler', gatewayV0AuthPreHandler);
      await f.register(workflowsRoutes, { prefix: '/workflows' });
      await f.register(agentsRoutes, { prefix: '/agents' });
      await f.register(runsRoutes, { prefix: '/runs' });
      await f.register(studioRoutes, { prefix: '/studio' });
    },
    { prefix: '/v0' },
  );

  try {
    await fastify.listen({ port: config.API_PORT, host: '0.0.0.0' });
    console.log(`Runtime API listening on port ${config.API_PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  const shutdown = async (): Promise<void> => {
    try {
      await fastify.close();
    } catch (err) {
      fastify.log.error(err);
    }
    try {
      await shutdownTelemetry();
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
