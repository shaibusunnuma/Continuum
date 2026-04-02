import Fastify from 'fastify';
import { config } from '../config';
import { initObservability } from '@durion/sdk';
import { startTelemetry, shutdownTelemetry } from '../otel';
import { gatewayV0AuthPreHandler } from './gateway-v0-auth';
import { studioRunsRoutes } from './routes/studio-runs';
import { studioRoutes } from './routes/studio';
import { ingestSpans } from './span-buffer';

async function main(): Promise<void> {
  await startTelemetry();

  initObservability({
    tracing: { enabled: true },
    metrics: { enabled: true },
  });

  const fastify = Fastify({ logger: true });

  // Local OTLP trace ingestion for Durion Studio
  fastify.post('/v1/traces', async (request, reply) => {
    try {
      if (process.env.DURION_STUDIO_LOCAL === 'true') {
        ingestSpans(request.body);
      }
      return reply.code(200).send({});
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to ingest log' });
    }
  });

  /** Gateway v0 subset for Durion Studio — `/v0/studio/*` + minimal `/v0/runs/*`. See docs/gateway-api-v0.md */
  await fastify.register(
    async (f) => {
      f.addHook('preHandler', gatewayV0AuthPreHandler);
      await f.register(studioRunsRoutes, { prefix: '/runs' });
      await f.register(studioRoutes, { prefix: '/studio' });
    },
    { prefix: '/v0' },
  );

  try {
    await fastify.listen({ port: config.API_PORT, host: '0.0.0.0' });
    console.log(`Durion Studio gateway listening on port ${config.API_PORT}`);
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
