import '../shared/config';
import Fastify from 'fastify';
import { config } from '../shared/config';
import { initObservability } from '../sdk';
import { workflowsRoutes } from './routes/workflows';
import { agentsRoutes } from './routes/agents';
import { runsRoutes } from './routes/runs';

initObservability({
  tracing: { enabled: process.env.AI_RUNTIME_ENABLE_TRACING === '1' },
  metrics: { enabled: process.env.AI_RUNTIME_ENABLE_METRICS === '1' },
});

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
