import '../shared/config';
import Fastify from 'fastify';
import { config } from '../shared/config';
import { workflowsRoutes } from './routes/workflows';
import { agentsRoutes } from './routes/agents';
import { runsRoutes } from './routes/runs';

async function main() {
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
}

main();
