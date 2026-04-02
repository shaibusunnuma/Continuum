import Fastify from 'fastify';
import { config } from '../config';
import { gatewayV0AuthPreHandler } from './gateway-v0-auth';
import { workflowsRoutes } from './routes/workflows';
import { runsRoutes } from './routes/runs';

async function main(): Promise<void> {
  const fastify = Fastify({ logger: true });

  await fastify.register(
    async (f) => {
      f.addHook('preHandler', gatewayV0AuthPreHandler);
      await f.register(workflowsRoutes, { prefix: '/workflows' });
      await f.register(runsRoutes, { prefix: '/runs' });
    },
    { prefix: '/v0' },
  );

  try {
    await fastify.listen({ port: config.HITL_GATEWAY_PORT, host: '0.0.0.0' });
    console.log(`HITL demo gateway (Gateway v0) listening on port ${config.HITL_GATEWAY_PORT}`);
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
